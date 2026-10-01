import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { dropRetentionTTLIndexes } from './retentionTTLIndex';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('dropRetentionTTLIndexes', () => {
  describe('with pre-existing TTL indexes (simulates upgrade)', () => {
    beforeAll(async () => {
      const db = mongoose.connection.db!;

      await db.createCollection('conversations');
      await db
        .collection('conversations')
        .createIndex({ expiredAt: 1 }, { name: 'expiredAt_1', expireAfterSeconds: 0 });

      await db.createCollection('messages');
      await db
        .collection('messages')
        .createIndex({ expiredAt: 1 }, { name: 'expiredAt_1', expireAfterSeconds: 0 });
    });

    it('drops the TTL index and creates the replacement on both collections', async () => {
      const result = await dropRetentionTTLIndexes(mongoose.connection);

      expect(result.errors).toHaveLength(0);
      expect(result.dropped).toEqual(
        expect.arrayContaining(['conversations.expiredAt_1', 'messages.expiredAt_1']),
      );
      expect(result.created).toEqual(
        expect.arrayContaining([
          'conversations.expiredAt_1_purgeNotBefore_1',
          'messages.expiredAt_1',
        ]),
      );
    });

    it('the conversations replacement index has no expireAfterSeconds and includes purgeNotBefore', async () => {
      const indexes = await mongoose.connection.db!.collection('conversations').indexes();
      const replacement = indexes.find((idx) => idx.name === 'expiredAt_1_purgeNotBefore_1');

      expect(replacement).toBeDefined();
      expect(replacement!.expireAfterSeconds).toBeUndefined();
      expect(replacement!.key).toEqual({ expiredAt: 1, purgeNotBefore: 1 });
    });

    it('the messages replacement index has no expireAfterSeconds', async () => {
      const indexes = await mongoose.connection.db!.collection('messages').indexes();
      const replacement = indexes.find((idx) => idx.name === 'expiredAt_1');

      expect(replacement).toBeDefined();
      expect(replacement!.expireAfterSeconds).toBeUndefined();
      expect(replacement!.key).toEqual({ expiredAt: 1 });
    });

    it('reports no TTL indexes left on a second run (idempotent)', async () => {
      const result = await dropRetentionTTLIndexes(mongoose.connection);

      expect(result.errors).toHaveLength(0);
      expect(result.dropped).toHaveLength(0);
      expect(result.created).toHaveLength(0);
      expect(result.skipped).toEqual(
        expect.arrayContaining(['conversations.expiredAt_1', 'messages.expiredAt_1']),
      );
    });
  });

  describe('with a fresh database (no pre-existing TTL index)', () => {
    beforeAll(async () => {
      await mongoose.connection.dropDatabase();
      const db = mongoose.connection.db!;
      await db.createCollection('conversations');
      await db
        .collection('conversations')
        .createIndex({ expiredAt: 1, purgeNotBefore: 1 }, { name: 'expiredAt_1_purgeNotBefore_1' });
      await db.createCollection('messages');
      await db.collection('messages').createIndex({ expiredAt: 1 }, { name: 'expiredAt_1' });
    });

    it('is a no-op', async () => {
      const result = await dropRetentionTTLIndexes(mongoose.connection);

      expect(result.errors).toHaveLength(0);
      expect(result.dropped).toHaveLength(0);
      expect(result.created).toHaveLength(0);
      expect(result.skipped.length).toBeGreaterThan(0);
    });
  });

  describe('dryRun', () => {
    beforeAll(async () => {
      await mongoose.connection.dropDatabase();
      const db = mongoose.connection.db!;
      await db.createCollection('conversations');
      await db
        .collection('conversations')
        .createIndex({ expiredAt: 1 }, { name: 'expiredAt_1', expireAfterSeconds: 0 });
    });

    it('plans the drop without changing any index', async () => {
      const result = await dropRetentionTTLIndexes(mongoose.connection, { dryRun: true });

      expect(result.errors).toHaveLength(0);
      expect(result.dropped).toHaveLength(0);
      expect(result.created).toHaveLength(0);

      const indexes = await mongoose.connection.db!.collection('conversations').indexes();
      const ttlIndex = indexes.find((idx) => idx.name === 'expiredAt_1');
      expect(ttlIndex?.expireAfterSeconds).toBe(0);
    });
  });
});
