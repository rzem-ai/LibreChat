// Deloitte Custom Change: Retention Update
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { backfillConversationRetention } from './retentionBackfill';
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

describe('backfillConversationRetention', () => {
  test('stamps eligible legacy rows with migrationRunTime + 30d and skips ineligible rows', async () => {
    const conversations = mongoose.connection.db!.collection('conversations');
    const messages = mongoose.connection.db!.collection('messages');

    await conversations.insertMany([
      { conversationId: 'legacy-null', expiredAt: null },
      { conversationId: 'already-set', expiredAt: new Date('2026-01-01T00:00:00.000Z') },
      { conversationId: 'temporary', expiredAt: null, isTemporary: true },
      {
        conversationId: 'exempt',
        expiredAt: null,
        retentionException: { exempt: true },
      },
    ]);
    await messages.insertMany([
      { messageId: 'legacy-null', expiredAt: null },
      { messageId: 'temporary', expiredAt: null, isTemporary: true },
    ]);

    const migrationRunTime = new Date('2026-06-01T00:00:00.000Z');
    const expectedDeadline = new Date(migrationRunTime.getTime() + 30 * 24 * 60 * 60 * 1000);

    const result = await backfillConversationRetention(mongoose.connection, {
      now: migrationRunTime,
    });

    expect(result).toEqual({
      conversations: { scanned: 1, updated: 1 },
      messages: { scanned: 1, updated: 1 },
    });

    const updatedConvo = await conversations.findOne({ conversationId: 'legacy-null' });
    expect(updatedConvo?.expiredAt).toEqual(expectedDeadline);

    const untouchedAlreadySet = await conversations.findOne({ conversationId: 'already-set' });
    expect(untouchedAlreadySet?.expiredAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));

    const untouchedTemporary = await conversations.findOne({ conversationId: 'temporary' });
    expect(untouchedTemporary?.expiredAt).toBeNull();

    const untouchedExempt = await conversations.findOne({ conversationId: 'exempt' });
    expect(untouchedExempt?.expiredAt).toBeNull();

    const updatedMessage = await messages.findOne({ messageId: 'legacy-null' });
    expect(updatedMessage?.expiredAt).toEqual(expectedDeadline);

    const untouchedMessage = await messages.findOne({ messageId: 'temporary' });
    expect(untouchedMessage?.expiredAt).toBeNull();
  });

  test('is idempotent — a second run updates nothing further', async () => {
    const conversations = mongoose.connection.db!.collection('conversations');
    await conversations.insertOne({ conversationId: 'legacy-null', expiredAt: null });

    const firstRun = await backfillConversationRetention(mongoose.connection, {
      now: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(firstRun.conversations).toEqual({ scanned: 1, updated: 1 });

    const secondRun = await backfillConversationRetention(mongoose.connection, {
      now: new Date('2026-06-02T00:00:00.000Z'),
    });
    expect(secondRun.conversations).toEqual({ scanned: 0, updated: 0 });
  });

  test('converges correctly on a rerun after a simulated partial completion', async () => {
    const conversations = mongoose.connection.db!.collection('conversations');
    await conversations.insertMany([
      { conversationId: 'already-done', expiredAt: new Date('2026-05-01T00:00:00.000Z') },
      { conversationId: 'still-pending', expiredAt: null },
    ]);

    const migrationRunTime = new Date('2026-06-01T00:00:00.000Z');
    const expectedDeadline = new Date(migrationRunTime.getTime() + 30 * 24 * 60 * 60 * 1000);

    const result = await backfillConversationRetention(mongoose.connection, {
      now: migrationRunTime,
    });
    expect(result.conversations).toEqual({ scanned: 1, updated: 1 });

    const alreadyDone = await conversations.findOne({ conversationId: 'already-done' });
    expect(alreadyDone?.expiredAt).toEqual(new Date('2026-05-01T00:00:00.000Z'));

    const nowDone = await conversations.findOne({ conversationId: 'still-pending' });
    expect(nowDone?.expiredAt).toEqual(expectedDeadline);
  });

  test('dry run makes zero writes', async () => {
    const conversations = mongoose.connection.db!.collection('conversations');
    await conversations.insertOne({ conversationId: 'legacy-null', expiredAt: null });

    const result = await backfillConversationRetention(mongoose.connection, {
      now: new Date('2026-06-01T00:00:00.000Z'),
      dryRun: true,
    });
    expect(result.conversations).toEqual({ scanned: 1, updated: 1 });

    const untouched = await conversations.findOne({ conversationId: 'legacy-null' });
    expect(untouched?.expiredAt).toBeNull();
  });

  test('completes fully across a batch-size boundary', async () => {
    const conversations = mongoose.connection.db!.collection('conversations');
    await conversations.insertMany(
      Array.from({ length: 5 }, (_, i) => ({
        conversationId: `legacy-${i}`,
        expiredAt: null,
      })),
    );

    const migrationRunTime = new Date('2026-06-01T00:00:00.000Z');
    const expectedDeadline = new Date(migrationRunTime.getTime() + 30 * 24 * 60 * 60 * 1000);

    const result = await backfillConversationRetention(mongoose.connection, {
      now: migrationRunTime,
      batchSize: 2,
    });
    expect(result.conversations).toEqual({ scanned: 5, updated: 5 });

    const remaining = await conversations.countDocuments({ expiredAt: expectedDeadline });
    expect(remaining).toBe(5);
  });
});
