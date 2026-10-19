import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IMemoryEntry } from '~/types';
import { createMemoryMethods, type MemoryMethods } from './memory';
import { tenantStorage } from '~/config/tenantContext';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let MemoryEntry: mongoose.Model<IMemoryEntry>;
let methods: MemoryMethods;

const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();
const agentId = 'agent_partition_a';
const otherAgentId = 'agent_partition_b';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  MemoryEntry = mongoose.models.MemoryEntry as mongoose.Model<IMemoryEntry>;
  methods = createMemoryMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await MemoryEntry.deleteMany({});
});

describe('memory partitions', () => {
  it('writes to the shared personal pool when agentId is omitted', async () => {
    await methods.setMemory({ userId, key: 'preference', value: 'likes tea', tokenCount: 3 });

    const personal = await methods.getUserMemories({ userId });
    expect(personal).toHaveLength(1);
    expect(personal[0].agentId == null).toBe(true);

    const agentScoped = await methods.getUserMemories({ userId, agentId });
    expect(agentScoped).toHaveLength(0);
  });

  it('isolates the same key across partitions', async () => {
    await methods.setMemory({ userId, key: 'context', value: 'personal', tokenCount: 1 });
    await methods.setMemory({ userId, key: 'context', value: 'agent a', tokenCount: 2, agentId });
    await methods.setMemory({
      userId,
      key: 'context',
      value: 'agent b',
      tokenCount: 3,
      agentId: otherAgentId,
    });

    const personal = await methods.getUserMemories({ userId });
    const partitionA = await methods.getUserMemories({ userId, agentId });
    const partitionB = await methods.getUserMemories({ userId, agentId: otherAgentId });

    expect(personal.map((m) => m.value)).toEqual(['personal']);
    expect(partitionA.map((m) => m.value)).toEqual(['agent a']);
    expect(partitionB.map((m) => m.value)).toEqual(['agent b']);
    expect(await MemoryEntry.countDocuments({ userId })).toBe(3);
  });

  it('upserts within a partition instead of duplicating', async () => {
    await methods.setMemory({ userId, key: 'context', value: 'first', tokenCount: 1, agentId });
    await methods.setMemory({ userId, key: 'context', value: 'second', tokenCount: 2, agentId });

    const partitionA = await methods.getUserMemories({ userId, agentId });
    expect(partitionA).toHaveLength(1);
    expect(partitionA[0].value).toBe('second');
  });

  it('treats legacy entries without an agentId field as the personal pool', async () => {
    await MemoryEntry.collection.insertOne({
      userId,
      key: 'legacy',
      value: 'pre-partition entry',
      tokenCount: 4,
      updated_at: new Date(),
    });

    const personal = await methods.getUserMemories({ userId });
    expect(personal.map((m) => m.key)).toEqual(['legacy']);

    await methods.setMemory({ userId, key: 'legacy', value: 'updated', tokenCount: 4 });
    expect(await MemoryEntry.countDocuments({ userId })).toBe(1);
    expect((await methods.getUserMemories({ userId }))[0].value).toBe('updated');
  });

  it('deletes only within the targeted partition', async () => {
    await methods.setMemory({ userId, key: 'context', value: 'personal', tokenCount: 1 });
    await methods.setMemory({ userId, key: 'context', value: 'agent a', tokenCount: 2, agentId });

    const agentDelete = await methods.deleteMemory({ userId, key: 'context', agentId });
    expect(agentDelete.ok).toBe(true);
    expect(await methods.getUserMemories({ userId })).toHaveLength(1);
    expect(await methods.getUserMemories({ userId, agentId })).toHaveLength(0);

    const missingDelete = await methods.deleteMemory({ userId, key: 'context', agentId });
    expect(missingDelete.ok).toBe(false);
  });

  it('updates by opaque id only for the owning user and selected partition', async () => {
    await methods.setMemory({
      userId,
      key: 'private_key',
      value: 'before',
      tokenCount: 1,
      agentId,
    });
    const [stored] = await methods.getUserMemories({ userId, agentId });
    const id = stored._id.toString();

    await expect(
      methods.setMemoryById({
        userId: otherUserId,
        id,
        value: 'wrong owner',
        tokenCount: 2,
        agentId,
      }),
    ).resolves.toEqual({ ok: false });
    await expect(
      methods.setMemoryById({
        userId,
        id,
        value: 'wrong partition',
        tokenCount: 2,
        agentId: otherAgentId,
      }),
    ).resolves.toEqual({ ok: false });

    const result = await methods.setMemoryById({
      userId,
      id,
      value: 'after',
      tokenCount: 2,
      agentId,
    });

    expect(result).toMatchObject({
      ok: true,
      memory: { key: 'private_key', value: 'after', tokenCount: 2, agentId },
    });
    expect(await methods.getUserMemories({ userId, agentId })).toHaveLength(1);
  });

  it('renames by opaque id without creating a duplicate record', async () => {
    await methods.setMemory({ userId, key: 'first', value: 'one', agentId });
    await methods.setMemory({ userId, key: 'second', value: 'two', agentId });
    const first = (await methods.getUserMemories({ userId, agentId })).find(
      (memory) => memory.key === 'first',
    );
    expect(first).toBeDefined();

    const conflict = await methods.setMemoryById({
      userId,
      id: first?._id.toString() ?? '',
      key: 'second',
      value: 'updated',
      agentId,
    });
    expect(conflict).toEqual({ ok: false, conflict: true });

    const renamed = await methods.setMemoryById({
      userId,
      id: first?._id.toString() ?? '',
      key: 'renamed',
      value: 'updated',
      agentId,
    });
    expect(renamed).toMatchObject({ ok: true, memory: { key: 'renamed', value: 'updated' } });
    expect(await MemoryEntry.countDocuments({ userId, agentId })).toBe(2);
  });

  it('updates and deletes by opaque id only in the owning tenant', async () => {
    const id = await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await methods.setMemory({ userId, key: 'private_key', value: 'stored', agentId });
      const [stored] = await methods.getUserMemories({ userId, agentId });
      return stored._id.toString();
    });

    await expect(
      tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
        methods.setMemoryById({ userId, id, value: 'wrong tenant', agentId }),
      ),
    ).resolves.toEqual({ ok: false });
    await expect(
      tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        methods.getUserMemories({ userId, agentId }),
      ),
    ).resolves.toEqual([expect.objectContaining({ value: 'stored' })]);
    await expect(
      tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
        methods.deleteMemoryById({ userId, id, agentId }),
      ),
    ).resolves.toEqual({ ok: false });
    await expect(
      tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        methods.deleteMemoryById({ userId: otherUserId, id, agentId }),
      ),
    ).resolves.toEqual({ ok: false });
    await expect(
      tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        methods.deleteMemoryById({ userId, id, agentId: otherAgentId }),
      ),
    ).resolves.toEqual({ ok: false });
    await expect(
      tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        methods.deleteMemoryById({ userId, id, agentId }),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it('scopes createMemory duplicate detection to the partition', async () => {
    await methods.createMemory({ userId, key: 'context', value: 'personal', tokenCount: 1 });

    await expect(
      methods.createMemory({ userId, key: 'context', value: 'dupe', tokenCount: 1 }),
    ).rejects.toThrow('already exists');

    const created = await methods.createMemory({
      userId,
      key: 'context',
      value: 'agent a',
      tokenCount: 2,
      agentId,
    });
    expect(created.ok).toBe(true);
  });

  it('formats memories per partition with partition-scoped totals', async () => {
    await methods.setMemory({ userId, key: 'one', value: 'personal one', tokenCount: 5 });
    await methods.setMemory({ userId, key: 'two', value: 'agent two', tokenCount: 7, agentId });

    const personal = await methods.getFormattedMemories({ userId });
    expect(personal.totalTokens).toBe(5);
    expect(personal.tokenCountsByKey).toEqual(new Map([['one', 5]]));
    expect(personal.withoutKeys).toContain('personal one');
    expect(personal.withoutKeys).not.toContain('agent two');

    const partitionA = await methods.getFormattedMemories({ userId, agentId });
    expect(partitionA.totalTokens).toBe(7);
    expect(partitionA.tokenCountsByKey).toEqual(new Map([['two', 7]]));
    expect(partitionA.withKeys).toContain('"key": "two"');
    expect(partitionA.withKeys).not.toContain('personal one');
  });

  it('signals a read failure rather than reporting an empty memory partition', async () => {
    const find = jest.spyOn(MemoryEntry, 'find').mockImplementationOnce(() => {
      throw new Error('simulated memory read failure');
    });
    try {
      const failed = await methods.getFormattedMemories({ userId });
      expect(failed).toEqual({
        withKeys: undefined,
        withoutKeys: undefined,
        totalTokens: 0,
        tokenCountsByKey: new Map(),
        readFailed: true,
      });
    } finally {
      find.mockRestore();
    }
    const empty = await methods.getFormattedMemories({ userId });
    expect(empty).toEqual({
      withKeys: '',
      withoutKeys: '',
      totalTokens: 0,
      tokenCountsByKey: new Map(),
      // Deloitte Custom Change: Retention Update
      memoryIds: [],
    });
  });

  it('returns every partition from getAllUserMemories and wipes them all on deleteAllUserMemories', async () => {
    await methods.setMemory({ userId, key: 'one', value: 'personal', tokenCount: 1 });
    await methods.setMemory({ userId, key: 'two', value: 'agent a', tokenCount: 1, agentId });
    await methods.setMemory({ userId: otherUserId, key: 'three', value: 'other', tokenCount: 1 });

    const all = await methods.getAllUserMemories(userId);
    expect(all).toHaveLength(2);

    const deleted = await methods.deleteAllUserMemories(userId);
    expect(deleted).toBe(2);
    expect(await MemoryEntry.countDocuments({ userId: otherUserId })).toBe(1);
  });
});
// Deloitte Custom Change: Retention Update

describe('memory retention stamping', () => {
  it('stamps lastActivityAt/expiredAt on createMemory, setMemory, and setMemoryById when retentionHours is provided', async () => {
    const before = Date.now();

    await methods.createMemory({ userId, key: 'key_one', value: 'v1' }, { retentionHours: 24 });
    const created = await MemoryEntry.findOne({ userId, key: 'key_one' }).lean();
    expect(created?.lastActivityAt).toBeInstanceOf(Date);
    expect(created?.expiredAt?.getTime()).toBeGreaterThan(before + 23 * 60 * 60 * 1000);

    await methods.setMemory({ userId, key: 'key_two', value: 'v2' }, { retentionHours: 48 });
    const set = await MemoryEntry.findOne({ userId, key: 'key_two' }).lean();
    expect(set?.expiredAt?.getTime()).toBeGreaterThan(before + 47 * 60 * 60 * 1000);

    await methods.setMemoryById(
      { userId, id: set!._id.toString(), value: 'v2-updated' },
      { retentionHours: 72 },
    );
    const updated = await MemoryEntry.findById(set!._id).lean();
    expect(updated?.expiredAt?.getTime()).toBeGreaterThan(before + 71 * 60 * 60 * 1000);
  });

  it('leaves lastActivityAt/expiredAt unset when retentionHours is omitted', async () => {
    await methods.createMemory({ userId, key: 'no_retention', value: 'v1' });
    const doc = await MemoryEntry.findOne({ userId, key: 'no_retention' }).lean();
    expect(doc?.lastActivityAt).toBeUndefined();
    expect(doc?.expiredAt).toBeUndefined();
  });
});

describe('memory purge-sweep claim/release/confirm/touch', () => {
  it('claims only expired, unclaimed memories and stamps a claim lease', async () => {
    const now = new Date();
    const expired = await MemoryEntry.create({
      userId,
      key: 'expired',
      value: 'v',
      expiredAt: new Date(now.getTime() - 1000),
    });
    await MemoryEntry.create({
      userId,
      key: 'not_expired',
      value: 'v',
      expiredAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    const claimed = await methods.claimExpiredMemories(10, { leaseMs: 10 * 60 * 1000, now });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].resourceId).toBe(expired._id.toString());
    expect(claimed[0].purgeAttempts).toBe(1);

    const reclaimAttempt = await methods.claimExpiredMemories(10, { leaseMs: 10 * 60 * 1000, now });
    expect(reclaimAttempt).toHaveLength(0);
  });

  it('reclaims a memory once its lease has expired', async () => {
    const now = new Date();
    const expired = await MemoryEntry.create({
      userId,
      key: 'expired_lease',
      value: 'v',
      expiredAt: new Date(now.getTime() - 1000),
      purgeClaimId: 'stale_claim',
      purgeClaimedAt: new Date(now.getTime() - 20 * 60 * 1000),
      purgeAttempts: 1,
    });

    const claimed = await methods.claimExpiredMemories(10, { leaseMs: 10 * 60 * 1000, now });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].resourceId).toBe(expired._id.toString());
    expect(claimed[0].purgeAttempts).toBe(2);
    expect(claimed[0].purgeClaimId).not.toBe('stale_claim');
  });

  it('releases a claim on success by clearing claim fields', async () => {
    const doc = await MemoryEntry.create({
      userId,
      key: 'release_success',
      value: 'v',
      expiredAt: new Date(Date.now() - 1000),
      purgeClaimId: 'claim-1',
      purgeClaimedAt: new Date(),
    });

    await methods.releaseMemoryPurgeClaim(doc._id, { success: true, purgeClaimId: 'claim-1' });

    const after = await MemoryEntry.findById(doc._id).lean();
    expect(after?.purgeClaimId).toBeUndefined();
    expect(after?.purgeClaimedAt).toBeUndefined();
  });

  it('on failure, parks the row behind purgeNotBefore, and a release with a stale claim token is a no-op', async () => {
    const doc = await MemoryEntry.create({
      userId,
      key: 'release_failure',
      value: 'v',
      expiredAt: new Date(Date.now() - 1000),
      purgeClaimId: 'claim-1',
      purgeClaimedAt: new Date(),
    });

    await methods.releaseMemoryPurgeClaim(doc._id, {
      success: false,
      retryDelayMs: 60_000,
      purgeClaimId: 'wrong_claim',
    });
    let after = await MemoryEntry.findById(doc._id).lean();
    expect(after?.purgeClaimId).toBe('claim-1');
    expect(after?.purgeNotBefore).toBeUndefined();

    await methods.releaseMemoryPurgeClaim(doc._id, {
      success: false,
      retryDelayMs: 60_000,
      purgeClaimId: 'claim-1',
    });
    after = await MemoryEntry.findById(doc._id).lean();
    expect(after?.purgeClaimId).toBeUndefined();
    expect(after?.purgeNotBefore).toBeInstanceOf(Date);
  });

  it('confirms eligibility only for the matching claim token', async () => {
    const now = new Date();
    const doc = await MemoryEntry.create({
      userId,
      key: 'confirm_eligible',
      value: 'v',
      expiredAt: new Date(now.getTime() - 1000),
      purgeClaimId: 'claim-1',
    });

    await expect(
      methods.confirmMemoryPurgeEligible(doc._id.toString(), 'wrong_claim', now),
    ).resolves.toBeNull();

    const confirmed = await methods.confirmMemoryPurgeEligible(doc._id.toString(), 'claim-1', now);
    expect(confirmed?._id.toString()).toBe(doc._id.toString());
  });

  it('aborts confirmation once expiredAt has been pushed into the future (e.g. renewed use after the claim)', async () => {
    const now = new Date();
    const doc = await MemoryEntry.create({
      userId,
      key: 'confirm_renewed',
      value: 'v',
      expiredAt: new Date(now.getTime() + 60 * 60 * 1000),
      purgeClaimId: 'claim-1',
    });

    await expect(
      methods.confirmMemoryPurgeEligible(doc._id.toString(), 'claim-1', now),
    ).resolves.toBeNull();
  });

  it('touches lastActivityAt/expiredAt for memories outside the throttle window, and skips those inside it', async () => {
    const now = Date.now();
    const stale = await MemoryEntry.create({
      userId,
      key: 'touch_stale',
      value: 'v',
      lastActivityAt: new Date(now - 2 * 60 * 60 * 1000),
    });
    const recent = await MemoryEntry.create({
      userId,
      key: 'touch_recent',
      value: 'v',
      lastActivityAt: new Date(now - 60 * 1000),
    });
    const neverTouched = await MemoryEntry.create({ userId, key: 'touch_never', value: 'v' });

    await methods.touchMemoriesLastActivity(
      [stale._id, recent._id, neverTouched._id],
      24,
      60 * 60 * 1000,
    );

    const [staleAfter, recentAfter, neverTouchedAfter] = await Promise.all([
      MemoryEntry.findById(stale._id).lean(),
      MemoryEntry.findById(recent._id).lean(),
      MemoryEntry.findById(neverTouched._id).lean(),
    ]);

    expect(staleAfter?.expiredAt).toBeInstanceOf(Date);
    expect(recentAfter?.expiredAt).toBeUndefined();
    expect(neverTouchedAfter?.expiredAt).toBeInstanceOf(Date);
  });
});
