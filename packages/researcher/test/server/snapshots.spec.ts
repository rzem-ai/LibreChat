import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { SnapshotStorage } from '../../src/server/snapshots';
import type { ResearchHostMethods } from '../../src/db';
import { createSnapshotRecorder, sweepSnapshots, isSweepDue } from '../../src/server/snapshots';
import { createResearchDbMethods, createResearchModels } from '../../src/db';

const DB_SETUP_TIMEOUT_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;

/** Stand-in for the deployment's file strategy (local disk, S3, ...). */
function memoryStorage(failRemovals = new Set<string>()) {
  const objects = new Map<string, string>();
  const storage: SnapshotStorage = {
    save: async ({ key, markdown }) => {
      objects.set(key, markdown);
      return { storageKey: key, fileStrategy: 'memory' };
    },
    read: async (snapshot) => objects.get(snapshot.storageKey) ?? null,
    remove: async (snapshot) => {
      if (failRemovals.has(snapshot.storageKey)) {
        throw new Error('storage unavailable');
      }
      objects.delete(snapshot.storageKey);
    },
  };
  return { storage, objects };
}

const userId = new mongoose.Types.ObjectId().toString();
const otherUser = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  methods = { ...createMethods(mongoose), ...createResearchDbMethods(mongoose) };
  await mongoose.models.Snapshot.init();
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await mongoose.models.Snapshot.deleteMany({});
});

describe('createSnapshotRecorder', () => {
  it('stores the markdown, hashes it and writes an owned metadata row', async () => {
    const { storage, objects } = memoryStorage();
    const recorder = createSnapshotRecorder({
      methods,
      storage,
      now: () => new Date('2026-11-03T01:02:03.000Z'),
    });
    const snapshot = await recorder.record({
      userId,
      sourceKind: 'web',
      reference: 'https://example.com/a',
      url: 'https://example.com/a',
      title: 'A',
      markdown: '# A\n\nBody',
    });

    expect(snapshot.id).toMatch(/^snap_[A-Za-z0-9_-]{12}$/);
    expect(snapshot.reference).toBe('https://example.com/a@2026-11-03T01:02:03.000Z');
    expect(snapshot.contentHash).toBe(createHash('sha256').update('# A\n\nBody').digest('hex'));
    expect(snapshot.bytes).toBe(Buffer.byteLength('# A\n\nBody'));
    expect(objects.get(snapshot.storageKey)).toBe('# A\n\nBody');
    expect(await methods.getSnapshotById(snapshot.id, otherUser)).toBeNull();
    expect(await recorder.reader.read(snapshot)).toBe('# A\n\nBody');
  });

  it('keeps a caller-supplied stable reference for documents and feed items', async () => {
    const { storage } = memoryStorage();
    const recorder = createSnapshotRecorder({ methods, storage });
    const snapshot = await recorder.record({
      userId,
      sourceKind: 'document',
      reference: 'site-1/drive-2/item-3',
      stableReference: true,
      markdown: 'Doc',
    });
    expect(snapshot.reference).toBe('site-1/drive-2/item-3');
  });

  it('records shared feed snapshots without an owner', async () => {
    const { storage } = memoryStorage();
    const recorder = createSnapshotRecorder({ methods, storage });
    const snapshot = await recorder.record({
      userId: null,
      sourceKind: 'rss',
      reference: 'guid-1',
      stableReference: true,
      feedId: 'feed-1',
      markdown: 'Item',
    });
    expect(snapshot.storageKey).toContain('shared');
    expect(await methods.getSnapshotById(snapshot.id, otherUser)).not.toBeNull();
  });
});

describe('sweepSnapshots', () => {
  it('deletes expired unarchived snapshots from storage and the database', async () => {
    const now = new Date('2026-11-03T03:00:00.000Z');
    const { storage, objects } = memoryStorage();
    const old = createSnapshotRecorder({
      methods,
      storage,
      now: () => new Date(now.getTime() - 50 * DAY_MS),
    });
    const fresh = createSnapshotRecorder({ methods, storage, now: () => now });

    const expired = await old.record({ userId, sourceKind: 'web', reference: 'u1', markdown: 'x' });
    const archived = await old.record({
      userId,
      sourceKind: 'web',
      reference: 'u2',
      markdown: 'y',
    });
    const recent = await fresh.record({
      userId,
      sourceKind: 'web',
      reference: 'u3',
      markdown: 'z',
    });
    await methods.archiveSnapshots([archived.id]);

    const result = await sweepSnapshots({ methods, storage, retentionDays: 45, now });
    expect(result).toEqual({ scanned: 1, deleted: 1, storageFailures: 0 });
    expect(objects.has(expired.storageKey)).toBe(false);
    expect(await methods.getSnapshotById(expired.id)).toBeNull();
    expect(await methods.getSnapshotById(archived.id)).not.toBeNull();
    expect(await methods.getSnapshotById(recent.id)).not.toBeNull();
  });

  it('keeps the row when its stored body cannot be removed, so the next sweep retries', async () => {
    const now = new Date('2026-11-03T03:00:00.000Z');
    const failing = new Set<string>();
    const { storage } = memoryStorage(failing);
    const old = createSnapshotRecorder({
      methods,
      storage,
      now: () => new Date(now.getTime() - 50 * DAY_MS),
    });
    const stuck = await old.record({ userId, sourceKind: 'web', reference: 'u1', markdown: 'x' });
    failing.add(stuck.storageKey);

    const result = await sweepSnapshots({ methods, storage, retentionDays: 45, now });
    expect(result).toEqual({ scanned: 1, deleted: 0, storageFailures: 1 });
    expect(await methods.getSnapshotById(stuck.id)).not.toBeNull();
  });

  it('works through more expired rows than one batch', async () => {
    const now = new Date('2026-11-03T03:00:00.000Z');
    const { storage } = memoryStorage();
    const old = createSnapshotRecorder({
      methods,
      storage,
      now: () => new Date(now.getTime() - 50 * DAY_MS),
    });
    for (let i = 0; i < 5; i++) {
      await old.record({ userId, sourceKind: 'web', reference: `u${i}`, markdown: `${i}` });
    }
    const result = await sweepSnapshots({ methods, storage, retentionDays: 45, now, batchSize: 2 });
    expect(result.deleted).toBe(5);
  });
});

describe('isSweepDue', () => {
  it('fires once in the configured UTC hour each day', () => {
    const at = (iso: string) => new Date(iso);
    expect(isSweepDue(at('2026-11-03T03:10:00.000Z'), 3, undefined)).toBe(true);
    expect(isSweepDue(at('2026-11-03T03:40:00.000Z'), 3, '2026-11-03')).toBe(false);
    expect(isSweepDue(at('2026-11-04T03:00:00.000Z'), 3, '2026-11-03')).toBe(true);
    expect(isSweepDue(at('2026-11-03T04:00:00.000Z'), 3, undefined)).toBe(false);
  });
});
