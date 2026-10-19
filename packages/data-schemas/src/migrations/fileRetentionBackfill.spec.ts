// Deloitte Custom Change: Retention Update
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { backfillFileRetention } from './fileRetentionBackfill';

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

describe('backfillFileRetention', () => {
  test('backfills lastUsedAt from updatedAt and skips rows that already have it', async () => {
    const files = mongoose.connection.db!.collection('files');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');

    await files.insertMany([
      { file_id: 'legacy-missing', updatedAt },
      { file_id: 'already-set', updatedAt, lastUsedAt: new Date('2026-02-01T00:00:00.000Z') },
    ]);

    const result = await backfillFileRetention(mongoose.connection);
    expect(result).toEqual({ scanned: 1, updated: 1 });

    const backfilled = await files.findOne({ file_id: 'legacy-missing' });
    expect(backfilled?.lastUsedAt).toEqual(updatedAt);

    const untouched = await files.findOne({ file_id: 'already-set' });
    expect(untouched?.lastUsedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
  });

  test('falls back to createdAt when updatedAt is missing', async () => {
    const files = mongoose.connection.db!.collection('files');
    const createdAt = new Date('2025-12-01T00:00:00.000Z');

    await files.insertOne({ file_id: 'no-updated-at', createdAt });

    await backfillFileRetention(mongoose.connection);

    const backfilled = await files.findOne({ file_id: 'no-updated-at' });
    expect(backfilled?.lastUsedAt).toEqual(createdAt);
  });

  test('is idempotent — a second run updates nothing further', async () => {
    const files = mongoose.connection.db!.collection('files');
    await files.insertOne({ file_id: 'legacy-missing', updatedAt: new Date() });

    const firstRun = await backfillFileRetention(mongoose.connection);
    expect(firstRun).toEqual({ scanned: 1, updated: 1 });

    const secondRun = await backfillFileRetention(mongoose.connection);
    expect(secondRun).toEqual({ scanned: 0, updated: 0 });
  });

  test('dry run makes zero writes', async () => {
    const files = mongoose.connection.db!.collection('files');
    await files.insertOne({ file_id: 'legacy-missing', updatedAt: new Date() });

    const result = await backfillFileRetention(mongoose.connection, { dryRun: true });
    expect(result).toEqual({ scanned: 1, updated: 1 });

    const untouched = await files.findOne({ file_id: 'legacy-missing' });
    expect(untouched?.lastUsedAt).toBeUndefined();
  });

  test('completes fully across a batch-size boundary', async () => {
    const files = mongoose.connection.db!.collection('files');
    await files.insertMany(
      Array.from({ length: 5 }, (_, i) => ({ file_id: `legacy-${i}`, updatedAt: new Date() })),
    );

    const result = await backfillFileRetention(mongoose.connection, { batchSize: 2 });
    expect(result).toEqual({ scanned: 5, updated: 5 });

    const remaining = await files.countDocuments({ lastUsedAt: { $exists: true } });
    expect(remaining).toBe(5);
  });
});
