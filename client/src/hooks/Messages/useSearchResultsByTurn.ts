import { useMemo } from 'react';
import { TAttachment, Tools, SearchResultData } from 'librechat-data-provider';
import type {
  MCPResultReference,
  MCPResultSource,
  FileReferenceMetadata,
  ResultReference,
} from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

interface FileSource {
  fileId: string;
  fileName: string;
  pages?: number[];
  relevance?: number;
  pageRelevance?: Record<string, number>;
  metadata?: FileReferenceMetadata;
}

interface MCPAttachmentPayload {
  sources?: MCPResultSource[];
}

interface DeduplicatedSource {
  fileId: string;
  fileName: string;
  pages: number[];
  relevance: number;
  pageRelevance: Record<string, number>;
  metadata?: FileReferenceMetadata;
}

/**
 * `MCPResultSource.content` is `title + description` joined for server-side citation
 * matching; strip the leading title back off so the chip doesn't show it twice.
 */
function getMCPSnippet(source: MCPResultSource): string {
  const description =
    source.title && source.content.startsWith(source.title)
      ? source.content.slice(source.title.length).replace(/^\n+/, '')
      : source.content;
  return description.length > 300 ? `${description.slice(0, 300)}…` : description;
}

/**
 * The `file_search` attachment is typed as {@link SearchResultData} in the
 * shared schema, but at runtime the agent file-search tool emits a
 * `{ sources: FileSource[] }` payload. Read the sources defensively.
 */
type FileSearchAttachmentData = SearchResultData & { sources?: FileSource[] };

function getFileSearchSources(data: FileSearchAttachmentData): FileSource[] {
  return Array.isArray(data.sources) ? data.sources : [];
}

/**
 * Hook that creates a map of turn numbers to SearchResultData from web search,
 * agent file search, and MCP tool result attachments.
 * @param attachments Array of attachment metadata
 * @returns A map of turn numbers to their corresponding search result data
 */
export function useSearchResultsByTurn(attachments?: TAttachment[]) {
  const localize = useLocalize();
  const searchResultsByTurn = useMemo(() => {
    const turnMap: { [key: string]: SearchResultData } = {};
    let agentFileSearchTurn = 0;
    let mcpTurn = 0;
    // Pre-count file_search attachments to match the backend's turn offset for MCP
    const fileSearchTotal = attachments?.filter((a) => a.type === Tools.file_search).length ?? 0;

    attachments?.forEach((attachment) => {
      // Handle web search attachments (existing functionality)
      if (attachment.type === Tools.web_search && attachment[Tools.web_search]) {
        const searchData = attachment[Tools.web_search];
        if (searchData && typeof searchData.turn === 'number') {
          // Merge rather than overwrite: file_search/MCP count turns independently from
          // web_search, so the same numeric key can legitimately hold both a file_search
          // entry (`references`) and a web_search entry (`organic`/`topStories`/etc.) —
          // overwriting would silently drop whichever attachment was processed first.
          const turnKey = searchData.turn.toString();
          turnMap[turnKey] = { ...turnMap[turnKey], ...searchData };
        }
      }

      // Handle agent file search attachments (following web search pattern)
      if (attachment.type === Tools.file_search && attachment[Tools.file_search]) {
        const sources = getFileSearchSources(attachment[Tools.file_search]);

        // Deduplicate sources by fileId and merge pages
        const deduplicatedSources = new Map<string, DeduplicatedSource>();

        sources.forEach((source: FileSource) => {
          const fileId = source.fileId;
          if (deduplicatedSources.has(fileId)) {
            // Merge pages for the same file
            const existing = deduplicatedSources.get(fileId);
            if (existing) {
              const existingPages = existing.pages || [];
              const newPages = source.pages || [];
              const allPages = [...existingPages, ...newPages];
              const uniquePages = [...new Set(allPages)].sort((a, b) => a - b);
              const mergedPageRelevance = {
                ...existing.pageRelevance,
                ...source.pageRelevance,
              };
              existing.pages = uniquePages;
              existing.relevance = Math.max(existing.relevance || 0, source.relevance || 0);
              existing.pageRelevance = mergedPageRelevance;
            }
          } else {
            deduplicatedSources.set(fileId, {
              fileId: source.fileId,
              fileName: source.fileName,
              pages: source.pages || [],
              relevance: source.relevance || 0.5,
              pageRelevance: source.pageRelevance || {},
              metadata: source.metadata,
            });
          }
        });

        const agentSearchData: SearchResultData = {
          turn: agentFileSearchTurn,
          references: Array.from(deduplicatedSources.values()).map(
            (source) =>
              ({
                title: source.fileName || localize('com_file_unknown'),
                link: `#file-${source.fileId}`,
                attribution: source.fileName || localize('com_file_unknown'),
                snippet:
                  source.pages && source.pages.length > 0
                    ? localize('com_file_pages', { pages: source.pages.join(', ') })
                    : '',
                type: 'file' as const,
                fileId: source.fileId,
                fileName: source.fileName,
                pages: source.pages,
                pageRelevance: source.pageRelevance,
                relevance: source.relevance,
                metadata: source.metadata,
              }) as ResultReference,
          ),
        };

        // Merge rather than overwrite: web_search counts turns independently from
        // file_search, so the same numeric key can legitimately hold both an already-merged
        // web_search entry and this file_search entry.
        const turnKey = agentFileSearchTurn.toString();
        turnMap[turnKey] = { ...turnMap[turnKey], ...agentSearchData };
        agentFileSearchTurn++;
      }

      // Handle MCP tool result attachments — turns are offset by file_search count.
      // The backend (buildMCPPassages) advances its turn counter for every MCP
      // attachment whose `sources` array is present — even an empty one, e.g. a
      // suppressed error response — so this must advance on the exact same
      // condition, not just when there happen to be refs to render. Otherwise a
      // failed call ahead of a successful one desyncs the turn index and the
      // successful call's citations point at a turn the client never populated.
      if (attachment.type === Tools.mcp_results && attachment[Tools.mcp_results]) {
        const payload = attachment[Tools.mcp_results] as MCPAttachmentPayload;
        if (payload?.sources) {
          const mcpRefs: MCPResultReference[] = payload.sources.map((source) => ({
            toolName: source.toolName,
            serverName: source.serverName,
            title: source.title || `${source.serverName}: ${source.toolName}`,
            attribution: source.serverName,
            snippet: getMCPSnippet(source),
            link: source.link || `#mcp-${source.serverName}-${source.toolName}`,
            type: 'mcp' as const,
            usageRestriction: source.usageRestriction,
            date: source.date, // Deloitte Custom Change: citation date
            usageRestrictionLink: source.usageRestrictionLink,
          }));

          if (mcpRefs.length > 0) {
            // The backend sets MCP turn = fileSearchTotal + mcpTurn, so mirror that here
            const turnKey = (fileSearchTotal + mcpTurn).toString();
            const existing = turnMap[turnKey];
            if (existing) {
              existing.mcp_results = [...(existing.mcp_results ?? []), ...mcpRefs];
            } else {
              turnMap[turnKey] = { turn: fileSearchTotal + mcpTurn, mcp_results: mcpRefs };
            }
          }
          mcpTurn++;
        }
      }
    });

    return turnMap;
  }, [attachments, localize]);

  return searchResultsByTurn;
}
