// Deloitte Custom Change: Retention Update
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { backfillMemoryRetention } from './memoryRetentionBackfill';
import { DEFAULT_MEMORY_RETENTION_HOURS } from '~/utils/retention';
import logger from '~/config/winston';

logger.silent = true;

let mongoServer: InstanceType<typeof MongoMemoryServer>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

const retentionMs = DEFAULT_MEMORY_RETENTION_HOURS * 60 * 60 * 1000;

describe('backfillMemoryRetention', () => {
  test('backfills lastActivityAt + expiredAt from updated_at and skips rows that already have expiredAt', async () => {
    const memories = mongoose.connection.db!.collection('memoryentries');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const existingExpiredAt = new Date('2026-03-01T00:00:00.000Z');

    await memories.insertMany([
      { key: 'legacy-missing', updated_at: updatedAt },
      {
        key: 'already-set',
        updated_at: updatedAt,
        lastActivityAt: new Date('2026-02-01T00:00:00.000Z'),
        expiredAt: existingExpiredAt,
      },
    ]);

    const result = await backfillMemoryRetention(mongoose.connection);
    expect(result).toEqual({ scanned: 1, updated: 1 });

    const backfilled = await memories.findOne({ key: 'legacy-missing' });
    expect(backfilled?.lastActivityAt).toEqual(updatedAt);
    expect(backfilled?.expiredAt).toEqual(new Date(updatedAt.getTime() + retentionMs));

    const untouched = await memories.findOne({ key: 'already-set' });
    expect(untouched?.lastActivityAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    expect(untouched?.expiredAt).toEqual(existingExpiredAt);
  });

  test('falls back to the current time when updated_at is missing', async () => {
    const memories = mongoose.connection.db!.collection('memoryentries');
    await memories.insertOne({ key: 'no-updated-at' });

    const before = new Date();
    await backfillMemoryRetention(mongoose.connection);
    const after = new Date();

    const backfilled = await memories.findOne({ key: 'no-updated-at' });
    expect(backfilled?.lastActivityAt).toBeInstanceOf(Date);
    expect(backfilled?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(backfilled?.lastActivityAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(backfilled?.expiredAt.getTime()).toBeGreaterThanOrEqual(before.getTime() + retentionMs);
    expect(backfilled?.expiredAt.getTime()).toBeLessThanOrEqual(after.getTime() + retentionMs);
  });

  test('recomputes expiredAt from an existing lastActivityAt left over from a prior partial backfill', async () => {
    const memories = mongoose.connection.db!.collection('memoryentries');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const priorAnchor = new Date('2025-06-01T00:00:00.000Z');

    await memories.insertOne({
      key: 'partial',
      updated_at: updatedAt,
      lastActivityAt: priorAnchor,
    });

    await backfillMemoryRetention(mongoose.connection);

    const backfilled = await memories.findOne({ key: 'partial' });
    expect(backfilled?.lastActivityAt).toEqual(priorAnchor);
    expect(backfilled?.expiredAt).toEqual(new Date(priorAnchor.getTime() + retentionMs));
  });

  test('is idempotent — a second run updates nothing further', async () => {
    const memories = mongoose.connection.db!.collection('memoryentries');
    await memories.insertOne({ key: 'legacy-missing', updated_at: new Date() });

    const firstRun = await backfillMemoryRetention(mongoose.connection);
    expect(firstRun).toEqual({ scanned: 1, updated: 1 });

    const secondRun = await backfillMemoryRetention(mongoose.connection);
    expect(secondRun).toEqual({ scanned: 0, updated: 0 });
  });

  test('dry run makes zero writes', async () => {
    const memories = mongoose.connection.db!.collection('memoryentries');
    await memories.insertOne({ key: 'legacy-missing', updated_at: new Date() });

    const result = await backfillMemoryRetention(mongoose.connection, { dryRun: true });
    expect(result).toEqual({ scanned: 1, updated: 1 });

    const untouched = await memories.findOne({ key: 'legacy-missing' });
    expect(untouched?.lastActivityAt).toBeUndefined();
    expect(untouched?.expiredAt).toBeUndefined();
  });

  test('completes fully across a batch-size boundary', async () => {
    const memories = mongoose.connection.db!.collection('memoryentries');
    await memories.insertMany(
      Array.from({ length: 5 }, (_, i) => ({ key: `legacy-${i}`, updated_at: new Date() })),
    );

    const result = await backfillMemoryRetention(mongoose.connection, { batchSize: 2 });
    expect(result).toEqual({ scanned: 5, updated: 5 });

    const remaining = await memories.countDocuments({ expiredAt: { $exists: true } });
    expect(remaining).toBe(5);
  });
});
