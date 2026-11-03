import type { TResearchConfig } from '../contract/research';
import type { NativeSearchInvoke } from './search';
import type { SnapshotStorage } from './snapshots';
import type { ResearchToolDeps } from './tools';
import type { McpCallTool } from './documents';
import type { SafeFetcher } from './fetch';
import { createBraveSearchClient, createNativeSearchClient, resolveSearch } from './search';
import { createMcpDocumentGateway } from './documents';
import { createSnapshotRecorder } from './snapshots';
import { createRagUploadSearch } from './uploads';
import { createSafePageFetcher } from './fetch';

/** Storage owner for shared (feed) snapshots, which belong to no user. */
export const SHARED_SNAPSHOT_OWNER = 'research-shared';

/**
 * Snapshot storage over the deployment's file strategy. The host passes the strategy's
 * functions with any request-shaped arguments already bound; bodies go to the private
 * uploads area under their owner.
 */
export function createStrategySnapshotStorage(deps: {
  source: string;
  saveBuffer: (input: {
    userId: string;
    buffer: Buffer;
    fileName: string;
    basePath: 'uploads';
    tenantId?: string;
  }) => Promise<string>;
  getDownloadStream: (filepath: string) => Promise<AsyncIterable<Buffer | string>>;
  deleteFile: (input: { filepath: string; userId: string }) => Promise<void>;
}): SnapshotStorage {
  return {
    async save({ key, markdown, userId, tenantId }) {
      const fileName = `research__${key.split('/').pop()}`;
      const storageKey = await deps.saveBuffer({
        userId: userId ?? SHARED_SNAPSHOT_OWNER,
        buffer: Buffer.from(markdown, 'utf8'),
        fileName,
        basePath: 'uploads',
        ...(tenantId ? { tenantId } : {}),
      });
      return { storageKey, fileStrategy: deps.source };
    },
    async read(snapshot) {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of await deps.getDownloadStream(snapshot.storageKey)) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        return Buffer.concat(chunks).toString('utf8');
      } catch {
        return null;
      }
    },
    async remove(snapshot) {
      await deps.deleteFile({
        filepath: snapshot.storageKey,
        userId: snapshot.user ? String(snapshot.user) : SHARED_SNAPSHOT_OWNER,
      });
    },
  };
}

/** The SSRF-guarded fetcher configured by `research.fetch`, shared by tools and the feed poller. */
export function createResearchFetcher(config: TResearchConfig): SafeFetcher {
  return createSafePageFetcher({
    maxBytes: config.fetch.maxBytes,
    timeoutMs: config.fetch.timeoutSeconds * 1000,
    maxRedirects: config.fetch.maxRedirects,
    ...(config.fetch.allowedAddresses ? { allowedAddresses: config.fetch.allowedAddresses } : {}),
  });
}

/** The `search_web` client for this config; none when built-in search has no invoker. */
function searchClient(
  config: TResearchConfig,
  nativeSearch: NativeSearchInvoke | undefined,
): Pick<ResearchToolDeps, 'search'> {
  const resolved = resolveSearch(config);
  if (resolved.provider === 'brave') {
    return { search: createBraveSearchClient({ apiKey: resolved.apiKey }) };
  }
  return nativeSearch ? { search: createNativeSearchClient({ invoke: nativeSearch }) } : {};
}

/**
 * Assembles the research tools' dependencies for one request from config. Document reads
 * need both a configured gateway tool and an MCP caller bound to the live request; upload
 * search needs the RAG API. Anything missing leaves its tool answering "unconfigured".
 */
export function buildResearchToolDeps(input: {
  config: TResearchConfig;
  methods: ResearchToolDeps['methods'] & Parameters<typeof createSnapshotRecorder>[0]['methods'];
  storage: SnapshotStorage;
  callMcpTool?: McpCallTool;
  rag?: Parameters<typeof createRagUploadSearch>[0];
  detachedDocuments?: boolean;
  /** Built-in search call, used when `research.search` resolves to `native`. */
  nativeSearch?: NativeSearchInvoke;
}): ResearchToolDeps {
  const { config } = input;
  const { mcpServer, toolName, argumentName } = config.documents;
  return {
    methods: input.methods,
    config,
    recorder: createSnapshotRecorder({ methods: input.methods, storage: input.storage }),
    fetcher: createResearchFetcher(config),
    ...searchClient(config, input.nativeSearch),
    ...(mcpServer && toolName && input.callMcpTool
      ? {
          documents: createMcpDocumentGateway({
            serverName: mcpServer,
            toolName,
            argumentName,
            callTool: input.callMcpTool,
          }),
        }
      : {}),
    ...(input.rag?.ragApiUrl ? { uploads: createRagUploadSearch(input.rag) } : {}),
    ...(input.detachedDocuments ? { detachedDocuments: true } : {}),
  };
}
