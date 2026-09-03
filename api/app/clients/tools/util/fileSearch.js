const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const { generateShortLivedToken, logAxiosError } = require('@librechat/api');
const { Tools, EToolResources } = require('librechat-data-provider');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { getFiles } = require('~/models');

const fileSearchJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        "A natural language query to search for relevant information in the files. Be specific and use keywords related to the information you're looking for. The query will be used for semantic similarity matching against the file contents.",
    },
  },
  required: ['query'],
};

// Deloitte Custom Change: added to detect missing attachments, since file search is enabled by default.
/**
 * Whether `tool_resources` currently references any file_search-eligible file,
 * either from the agent's permanent knowledge base (`file_ids`) or files
 * attached to this conversation (`files`, already resolved by `primeResources`).
 * @param {Agent['tool_resources']} [tool_resources]
 * @returns {boolean}
 */
const hasFileSearchAttachments = (tool_resources) =>
  (tool_resources?.[EToolResources.file_search]?.file_ids?.length ?? 0) > 0 ||
  (tool_resources?.[EToolResources.file_search]?.files?.length ?? 0) > 0;

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @param {string} [options.agentId] - The agent ID for file access control
 * @param {string} [options.agentResourceType] - Permission resource type for the authorized agent route
 * @returns {Promise<{
 *   files: Array<{ file_id: string; filename: string; fromAgent: boolean }>,
 *   toolContext: string
 * }>}
 */
const primeFiles = async (options) => {
  const { tool_resources, req, agentId, agentResourceType } = options;
  const file_ids = tool_resources?.[EToolResources.file_search]?.file_ids ?? [];
  const agentResourceIds = new Set(file_ids);
  const resourceFiles = tool_resources?.[EToolResources.file_search]?.files ?? [];

  // Get all files first
  const allFiles = (await getFiles({ file_id: { $in: file_ids } }, null, { text: 0 })) ?? [];

  // Filter by access if user and agent are provided
  let dbFiles;
  if (req?.user?.id && agentId) {
    dbFiles = await filterFilesByAgentAccess({
      files: allFiles,
      userId: req.user.id,
      role: req.user.role,
      agentId,
      resourceType: agentResourceType,
    });
  } else {
    dbFiles = allFiles;
  }

  dbFiles = dbFiles.concat(resourceFiles);

  // Deloitte Custom Change: no longer nag about missing files, since file search is enabled by default.
  // Stays empty unless a file is found below — nothing to tell the model when there's nothing to search.
  let toolContext = '';

  const files = [];
  for (let i = 0; i < dbFiles.length; i++) {
    const file = dbFiles[i];
    if (!file) {
      continue;
    }
    if (i === 0) {
      toolContext = `- Note: Use the ${Tools.file_search} tool to find relevant information within:`;
    }
    toolContext += `\n\t- ${file.filename}${
      agentResourceIds.has(file.file_id) ? '' : ' (just attached by user)'
    }`;
    files.push({
      file_id: file.file_id,
      filename: file.filename,
      fromAgent: agentResourceIds.has(file.file_id),
    });
  }

  return { files, toolContext };
};

/**
 *
 * @param {Object} options
 * @param {string} options.userId
 * @param {Array<{ file_id: string; filename: string; fromAgent?: boolean }>} options.files
 * @param {string} [options.entity_id]
 * @param {boolean} [options.fileCitations=false] - Whether file citations are enabled. This no longer
 *   injects anchor markers into the tool output for the model to echo; citations are now inserted
 *   deterministically after the run by `applyEndOfTraceCitations`. The flag is passed through on the
 *   returned artifact so `processFileCitations` can gate citation generation on it.
 * @returns
 */
const createFileSearchTool = async ({ userId, files, entity_id, fileCitations = false }) => {
  return tool(
    async ({ query }) => {
      if (files.length === 0) {
        return ['No files to search. Instruct the user to add files for the search.', undefined];
      }
      const jwtToken = generateShortLivedToken(userId);
      if (!jwtToken) {
        return ['There was an error authenticating the file search request.', undefined];
      }

      /**
       * @param {import('librechat-data-provider').TFile & { fromAgent?: boolean }} file
       * @returns {{ file_id: string, query: string, k: number, entity_id?: string }}
       */
      const createQueryBody = (file) => {
        const body = {
          file_id: file.file_id,
          query,
          k: 5,
        };
        // User-attached files are embedded under the user id (no entity);
        // only agent knowledge-base files carry the agent's entity_id.
        // Sending entity_id for user attachments makes the RAG API's entity
        // filter return no results for them. When files are provided by
        // primeFiles, fromAgent is always set; for callers that pass files
        // directly without the flag, the safe default is unscoped (no
        // entity_id).
        if (!entity_id || file.fromAgent !== true) {
          return body;
        }
        body.entity_id = entity_id;
        logger.debug(`[${Tools.file_search}] RAG API /query body`, body);
        return body;
      };

      const queryPromises = files.map((file) =>
        axios
          .post(`${process.env.RAG_API_URL}/query`, createQueryBody(file), {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
            },
          })
          .catch((error) => {
            logAxiosError({
              message: 'Error encountered in `file_search` while querying file',
              error,
            });
            return null;
          }),
      );

      const results = await Promise.all(queryPromises);
      const validResults = results.filter((result) => result !== null);

      if (validResults.length === 0) {
        return ['No results found or errors occurred while searching the files.', undefined];
      }

      const formattedResults = validResults
        .flatMap((result, fileIndex) =>
          result.data.map(([docInfo, distance]) => ({
            filename: docInfo.metadata.source.split('/').pop(),
            content: docInfo.page_content,
            distance,
            file_id: files[fileIndex]?.file_id,
            page: docInfo.metadata.page || null,
          })),
        )
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

      if (formattedResults.length === 0) {
        return [
          'No content found in the files. The files may not have been processed correctly or you may need to refine your query.',
          undefined,
        ];
      }

      const formattedString = formattedResults
        .map(
          (result) =>
            `File: ${result.filename}\nRelevance: ${(1.0 - result.distance).toFixed(4)}\nContent: ${result.content}\n`,
        )
        .join('\n---\n');

      const sources = formattedResults.map((result) => ({
        type: 'file',
        fileId: result.file_id,
        content: result.content,
        fileName: result.filename,
        relevance: 1.0 - result.distance,
        pages: result.page ? [result.page] : [],
        pageRelevance: result.page ? { [result.page]: 1.0 - result.distance } : {},
      }));

      return [formattedString, { [Tools.file_search]: { sources, fileCitations } }];
    },
    {
      name: Tools.file_search,
      responseFormat: 'content_and_artifact',
      description: `Performs semantic search across attached "${Tools.file_search}" documents using natural language queries. This tool analyzes the content of uploaded files to find relevant information, quotes, and passages that best match your query. Use this to extract specific information or find relevant sections within the available documents.`,
      schema: fileSearchJsonSchema,
    },
  );
};

module.exports = {
  createFileSearchTool,
  primeFiles,
  fileSearchJsonSchema,
  hasFileSearchAttachments,
};
