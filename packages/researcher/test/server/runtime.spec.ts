import { Readable } from 'node:stream';
import { researchSchema } from '../../src/contract/research';
import type { ISnapshot } from '../../src/db';
import {
  createStrategySnapshotStorage,
  buildResearchToolDeps,
  SHARED_SNAPSHOT_OWNER,
} from '../../src/server/runtime';

describe('createStrategySnapshotStorage', () => {
  const calls: Array<Record<string, unknown>> = [];
  const files = new Map<string, string>();
  const storage = createStrategySnapshotStorage({
    source: 's3',
    saveBuffer: async ({ userId, buffer, fileName, basePath }) => {
      calls.push({ userId, fileName, basePath });
      const filepath = `/${basePath}/${userId}/${fileName}`;
      files.set(filepath, buffer.toString('utf8'));
      return filepath;
    },
    getDownloadStream: async (filepath) => {
      if (!files.has(filepath)) {
        throw new Error('NoSuchKey');
      }
      return Readable.from([
        Buffer.from(files.get(filepath)!.slice(0, 3)),
        Buffer.from(files.get(filepath)!.slice(3)),
      ]);
    },
    deleteFile: async ({ filepath, userId }) => {
      calls.push({ deleted: filepath, userId });
      files.delete(filepath);
    },
  });

  it('saves into the private uploads area under the owner, or a shared owner', async () => {
    const owned = await storage.save({
      key: 'research/u1/snap_a.md',
      markdown: 'Hello',
      userId: 'u1',
    });
    const shared = await storage.save({
      key: 'research/shared/snap_b.md',
      markdown: 'Feed',
      userId: null,
    });
    expect(owned).toEqual({ storageKey: '/uploads/u1/research__snap_a.md', fileStrategy: 's3' });
    expect(shared.storageKey).toBe(`/uploads/${SHARED_SNAPSHOT_OWNER}/research__snap_b.md`);
    expect(calls[0]).toMatchObject({ basePath: 'uploads', userId: 'u1' });
  });

  it('reads the body back and treats an unreadable one as missing', async () => {
    expect(
      await storage.read({ storageKey: '/uploads/u1/research__snap_a.md', fileStrategy: 's3' }),
    ).toBe('Hello');
    expect(
      await storage.read({ storageKey: '/uploads/u1/missing.md', fileStrategy: 's3' }),
    ).toBeNull();
  });

  it('removes as the owner the snapshot was saved under', async () => {
    await storage.remove({
      storageKey: `/uploads/${SHARED_SNAPSHOT_OWNER}/research__snap_b.md`,
      fileStrategy: 's3',
      user: null,
    } as Pick<ISnapshot, 'storageKey' | 'fileStrategy' | 'user'>);
    expect(calls[calls.length - 1]).toEqual({
      deleted: `/uploads/${SHARED_SNAPSHOT_OWNER}/research__snap_b.md`,
      userId: SHARED_SNAPSHOT_OWNER,
    });
  });
});

describe('buildResearchToolDeps', () => {
  const base = {
    methods: {} as never,
    storage: { save: jest.fn(), read: jest.fn(), remove: jest.fn() },
  };

  it('leaves documents and uploads off unless they are configured and available', () => {
    const deps = buildResearchToolDeps({
      ...base,
      config: researchSchema.parse({ enabled: true }),
    });
    expect(deps.documents).toBeUndefined();
    expect(deps.uploads).toBeUndefined();
    expect(deps.search).toBeDefined();
    expect(deps.fetcher).toBeDefined();
  });

  it('wires the document gateway when a server, tool and live caller exist', () => {
    const config = researchSchema.parse({
      enabled: true,
      documents: { mcpServer: 'gateway', toolName: 'get_document' },
    });
    expect(buildResearchToolDeps({ ...base, config }).documents).toBeUndefined();
    expect(
      buildResearchToolDeps({ ...base, config, callMcpTool: jest.fn() }).documents,
    ).toBeDefined();
  });

  it('wires upload search when a RAG API is configured', () => {
    const deps = buildResearchToolDeps({
      ...base,
      config: researchSchema.parse({ enabled: true }),
      rag: {
        ragApiUrl: 'http://rag',
        httpClient: { post: jest.fn() },
        generateShortLivedToken: () => 't',
      },
    });
    expect(deps.uploads).toBeDefined();
  });
});
