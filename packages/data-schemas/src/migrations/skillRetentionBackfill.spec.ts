// Deloitte Custom Change: Retention Update
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { backfillSkillRetention } from './skillRetentionBackfill';
import { DEFAULT_AGENT_RETENTION_HOURS } from '~/utils/retention';
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

const retentionMs = DEFAULT_AGENT_RETENTION_HOURS * 60 * 60 * 1000;

describe('backfillSkillRetention', () => {
  test('backfills lastActivityAt + expiredAt from updatedAt and skips rows that already have expiredAt', async () => {
    const skills = mongoose.connection.db!.collection('skills');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const existingExpiredAt = new Date('2026-03-01T00:00:00.000Z');

    await skills.insertMany([
      { skill_id: 'legacy-missing', updatedAt },
      {
        skill_id: 'already-set',
        updatedAt,
        lastActivityAt: new Date('2026-02-01T00:00:00.000Z'),
        expiredAt: existingExpiredAt,
      },
    ]);

    const result = await backfillSkillRetention(mongoose.connection);
    expect(result).toEqual({ scanned: 1, updated: 1 });

    const backfilled = await skills.findOne({ skill_id: 'legacy-missing' });
    expect(backfilled?.lastActivityAt).toEqual(updatedAt);
    expect(backfilled?.expiredAt).toEqual(new Date(updatedAt.getTime() + retentionMs));

    const untouched = await skills.findOne({ skill_id: 'already-set' });
    expect(untouched?.lastActivityAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    expect(untouched?.expiredAt).toEqual(existingExpiredAt);
  });

  test('falls back to createdAt when updatedAt is missing', async () => {
    const skills = mongoose.connection.db!.collection('skills');
    const createdAt = new Date('2025-12-01T00:00:00.000Z');

    await skills.insertOne({ skill_id: 'no-updated-at', createdAt });

    await backfillSkillRetention(mongoose.connection);

    const backfilled = await skills.findOne({ skill_id: 'no-updated-at' });
    expect(backfilled?.lastActivityAt).toEqual(createdAt);
    expect(backfilled?.expiredAt).toEqual(new Date(createdAt.getTime() + retentionMs));
  });

  test('recomputes expiredAt from an existing lastActivityAt left over from a prior partial backfill', async () => {
    const skills = mongoose.connection.db!.collection('skills');
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const priorAnchor = new Date('2025-06-01T00:00:00.000Z');

    await skills.insertOne({ skill_id: 'partial', updatedAt, lastActivityAt: priorAnchor });

    await backfillSkillRetention(mongoose.connection);

    const backfilled = await skills.findOne({ skill_id: 'partial' });
    expect(backfilled?.lastActivityAt).toEqual(priorAnchor);
    expect(backfilled?.expiredAt).toEqual(new Date(priorAnchor.getTime() + retentionMs));
  });

  test('skips rows exempt via retentionException and leaves them permanently untouched', async () => {
    const skills = mongoose.connection.db!.collection('skills');
    await skills.insertOne({
      skill_id: 'exempt',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      retentionException: { exempt: true },
    });

    const result = await backfillSkillRetention(mongoose.connection);
    expect(result).toEqual({ scanned: 0, updated: 0 });

    const untouched = await skills.findOne({ skill_id: 'exempt' });
    expect(untouched?.lastActivityAt).toBeUndefined();
    expect(untouched?.expiredAt).toBeUndefined();
  });

  test('is idempotent — a second run updates nothing further', async () => {
    const skills = mongoose.connection.db!.collection('skills');
    await skills.insertOne({ skill_id: 'legacy-missing', updatedAt: new Date() });

    const firstRun = await backfillSkillRetention(mongoose.connection);
    expect(firstRun).toEqual({ scanned: 1, updated: 1 });

    const secondRun = await backfillSkillRetention(mongoose.connection);
    expect(secondRun).toEqual({ scanned: 0, updated: 0 });
  });

  test('dry run makes zero writes', async () => {
    const skills = mongoose.connection.db!.collection('skills');
    await skills.insertOne({ skill_id: 'legacy-missing', updatedAt: new Date() });

    const result = await backfillSkillRetention(mongoose.connection, { dryRun: true });
    expect(result).toEqual({ scanned: 1, updated: 1 });

    const untouched = await skills.findOne({ skill_id: 'legacy-missing' });
    expect(untouched?.lastActivityAt).toBeUndefined();
    expect(untouched?.expiredAt).toBeUndefined();
  });

  test('completes fully across a batch-size boundary', async () => {
    const skills = mongoose.connection.db!.collection('skills');
    await skills.insertMany(
      Array.from({ length: 5 }, (_, i) => ({ skill_id: `legacy-${i}`, updatedAt: new Date() })),
    );

    const result = await backfillSkillRetention(mongoose.connection, { batchSize: 2 });
    expect(result).toEqual({ scanned: 5, updated: 5 });

    const remaining = await skills.countDocuments({ expiredAt: { $exists: true } });
    expect(remaining).toBe(5);
  });
});
