const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  logAxiosError,
  selectFileCitationSources,
  generateShortLivedToken,
  executeFileSearchQuery,
} = require('@librechat/api');
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
 * @param {AppConfig} [options.appConfig]
 * @param {string} options.userId
 * @param {Array<{ file_id: string; filename: string; fromAgent?: boolean }>} options.files
 * @param {string} [options.entity_id]
 * @param {boolean} [options.fileCitations=false] - Whether file citations are enabled. This no longer
 *   injects anchor markers into the tool output for the model to echo; citations are now inserted
 *   deterministically after the run by `applyEndOfTraceCitations`. The flag is passed through on the
 *   returned artifact so `processFileCitations` can gate citation generation on it.
 * @returns
 */
const createFileSearchTool = async ({
  userId,
  files,
  entity_id,
  fileCitations = false,
  appConfig,
}) => {
  return tool(
    ({ query }) =>
      executeFileSearchQuery({
        query,
        userId,
        files,
        entity_id,
        fileCitations,
        appConfig,
        ragApiUrl: process.env.RAG_API_URL,
        httpClient: axios,
        generateShortLivedToken,
        logAxiosError,
        selectFileCitationSources,
        logger,
      }),
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
