/**
 * Utilities for extracting file_search retrieval sources from agent artifacts.
 *
 * Used by the OpenAI-compatible endpoint to expose retrieved RAG chunks
 * when `include_retrieval: true` is set in the request body.
 */

/** A single retrieved document chunk from a file_search tool call. */
export interface RetrievedChunk {
  content: string;
  fileName: string;
  fileId: string;
  relevance: number;
  pages: number[];
}

/** Payload appended to the non-streaming response when `include_retrieval: true`. */
export interface RetrievalPayload {
  sources: RetrievedChunk[];
}

/**
 * Extract file_search retrieved chunks from resolved tool attachments.
 *
 * Each attachment that carries a `file_search.sources` array is flattened
 * into a single list of {@link FileSearchSource} records.
 *
 * @param attachments - Resolved artifact objects from `artifactPromises`. May
 *   contain nulls or non-file-search attachments which are silently skipped.
 * @returns List of retrieval sources ordered by original relevance.
 */
export function extractRetrievalSources(attachments: unknown[]): RetrievedChunk[] {
  const sources: RetrievedChunk[] = [];

  for (const attachment of attachments) {
    if (
      attachment == null ||
      typeof attachment !== 'object' ||
      (attachment as Record<string, unknown>).type !== 'file_search'
    ) {
      continue;
    }

    const record = attachment as Record<string, unknown>;
    const fileSearch = record.file_search as Record<string, unknown> | undefined;
    const rawSources = fileSearch?.sources;
    if (!Array.isArray(rawSources)) {
      continue;
    }

    for (const s of rawSources) {
      if (s == null || typeof s !== 'object') {
        continue;
      }
      const src = s as Record<string, unknown>;
      const pages = Array.isArray(src.pages)
        ? src.pages.filter((page): page is number => typeof page === 'number')
        : [];
      sources.push({
        content: typeof src.content === 'string' ? src.content : '',
        fileName: typeof src.fileName === 'string' ? src.fileName : '',
        fileId: typeof src.fileId === 'string' ? src.fileId : '',
        relevance: typeof src.relevance === 'number' ? src.relevance : 0,
        pages,
      });
    }
  }

  return sources;
}
