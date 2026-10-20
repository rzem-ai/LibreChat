// Deloitte Custom Change: Retention Update
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { backfillMemoryRetention } from './memoryRetentionBackfill';

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

describe('backfillMemoryRetention', () => {
  test('backfills lastActivityAt from updated_at and skips rows that already have it', async () => {
    const memories = mongoose.connection.db!.collection('memoryentries');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');

    await memories.insertMany([
      { key: 'legacy-missing', updated_at: updatedAt },
      {
        key: 'already-set',
        updated_at: updatedAt,
        lastActivityAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const result = await backfillMemoryRetention(mongoose.connection);
    expect(result).toEqual({ scanned: 1, updated: 1 });

    const backfilled = await memories.findOne({ key: 'legacy-missing' });
    expect(backfilled?.lastActivityAt).toEqual(updatedAt);

    const untouched = await memories.findOne({ key: 'already-set' });
    expect(untouched?.lastActivityAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
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
  });

  test('completes fully across a batch-size boundary', async () => {
    const memories = mongoose.connection.db!.collection('memoryentries');
    await memories.insertMany(
      Array.from({ length: 5 }, (_, i) => ({ key: `legacy-${i}`, updated_at: new Date() })),
    );

    const result = await backfillMemoryRetention(mongoose.connection, { batchSize: 2 });
    expect(result).toEqual({ scanned: 5, updated: 5 });

    const remaining = await memories.countDocuments({ lastActivityAt: { $exists: true } });
    expect(remaining).toBe(5);
  });
});
