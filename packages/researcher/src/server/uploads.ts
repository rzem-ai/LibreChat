export type UploadHit = {
  fileId: string;
  filename: string;
  page?: number;
  content: string;
  distance: number;
};

/** Searches the user's own uploads through the RAG API (the `file_search` query path). */
export interface UploadSearch {
  search(input: {
    userId: string;
    fileIds: string[];
    query: string;
    signal?: AbortSignal;
  }): Promise<UploadHit[]>;
}

type RagChunk = [
  { page_content?: unknown; metadata?: { source?: unknown; page?: unknown } },
  number,
];

const DEFAULT_K = 5;
const DEFAULT_MAX_HITS = 10;

/**
 * Mirrors `executeFileSearchQuery`: one `/query` call per file with a short-lived token
 * for the user, no `entity_id` (user attachments stay user-scoped), best hits first.
 * The caller is responsible for passing only file ids the user owns.
 */
export function createRagUploadSearch(deps: {
  ragApiUrl: string;
  httpClient: {
    post: (
      url: string,
      body: { file_id: string; query: string; k: number },
      config: { headers: Record<string, string>; signal?: AbortSignal },
    ) => Promise<{ data: unknown }>;
  };
  generateShortLivedToken: (userId: string) => string;
  k?: number;
  maxHits?: number;
}): UploadSearch {
  const k = deps.k ?? DEFAULT_K;
  const maxHits = deps.maxHits ?? DEFAULT_MAX_HITS;

  return {
    async search({ userId, fileIds, query, signal }) {
      if (fileIds.length === 0 || query.trim().length === 0) {
        return [];
      }
      const token = deps.generateShortLivedToken(userId);
      const perFile = await Promise.all(
        fileIds.map(async (fileId): Promise<UploadHit[]> => {
          try {
            const response = await deps.httpClient.post(
              `${deps.ragApiUrl}/query`,
              { file_id: fileId, query, k },
              { headers: { Authorization: `Bearer ${token}` }, ...(signal ? { signal } : {}) },
            );
            const rows = Array.isArray(response.data) ? (response.data as RagChunk[]) : [];
            return rows.flatMap(([doc, distance]): UploadHit[] => {
              if (typeof doc?.page_content !== 'string' || typeof distance !== 'number') {
                return [];
              }
              const source = typeof doc.metadata?.source === 'string' ? doc.metadata.source : '';
              const page = doc.metadata?.page;
              return [
                {
                  fileId,
                  filename: source.split('/').pop() || fileId,
                  ...(typeof page === 'number' && Number.isInteger(page) ? { page } : {}),
                  content: doc.page_content,
                  distance,
                },
              ];
            });
          } catch {
            return [];
          }
        }),
      );
      return perFile
        .flat()
        .sort((a, b) => a.distance - b.distance)
        .slice(0, maxHits);
    },
  };
}
