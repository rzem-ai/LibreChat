import crypto from 'node:crypto';
import type { Types, FilterQuery, Model } from 'mongoose';
import type * as t from '~/types';
import logger from '~/config/winston';

/**
 * Formats a date in YYYY-MM-DD format
 */
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/** Partition filter: `agentId: null` matches both null and missing fields,
 *  so pre-partition entries remain part of the shared personal pool. */
const partitionFilter = (agentId?: string) => ({ agentId: agentId ?? null });

/** A memory claimed by the retention purge sweep, enough to classify and delete it. */
export interface ClaimedPurgeMemory {
  resourceId: string;
  userId: string;
  tenantId?: string;
  purgeClaimId: string;
  purgeAttempts: number;
}

export interface ReleaseMemoryPurgeClaimOptions {
  success: boolean;
  retryDelayMs?: number;
  /** The claim token the release must still own; a stale release no longer stomps a newer claim. */
  purgeClaimId: string;
}

// Factory function that takes mongoose instance and returns the methods
export function createMemoryMethods(mongoose: typeof import('mongoose')): {
  setMemory: (
    { userId, key, value, tokenCount, agentId }: t.SetMemoryParams,
    options?: { retentionHours?: number },
  ) => Promise<t.MemoryResult>;
  createMemory: (
    { userId, key, value, tokenCount, agentId }: t.SetMemoryParams,
    options?: { retentionHours?: number },
  ) => Promise<t.MemoryResult>;
  deleteMemory: ({ userId, key, agentId }: t.DeleteMemoryParams) => Promise<t.MemoryResult>;
  setMemoryById: (
    params: t.SetMemoryByIdParams,
    options?: { retentionHours?: number },
  ) => Promise<t.SetMemoryByIdResult>;
  deleteMemoryById: (params: t.MemoryByIdParams) => Promise<t.MemoryResult>;
  getAllUserMemories: (userId: string | Types.ObjectId) => Promise<t.IMemoryEntryLean[]>;
  getUserMemories: ({ userId, agentId }: t.GetUserMemoriesParams) => Promise<t.IMemoryEntryLean[]>;
  getFormattedMemories: ({
    userId,
    agentId,
  }: t.GetFormattedMemoriesParams) => Promise<t.FormattedMemoriesResult>;
  deleteAllUserMemories: (userId: string | Types.ObjectId) => Promise<number>;
  claimExpiredMemories: (
    limit: number,
    options: { leaseMs: number; now?: Date },
  ) => Promise<ClaimedPurgeMemory[]>;
  releaseMemoryPurgeClaim: (
    resourceId: Types.ObjectId | string,
    options: ReleaseMemoryPurgeClaimOptions,
  ) => Promise<void>;
  confirmMemoryPurgeEligible: (
    memoryId: Types.ObjectId | string,
    purgeClaimId: string,
    now?: Date,
  ) => Promise<Pick<t.IMemoryEntry, '_id'> | null>;
  touchMemoriesLastActivity: (
    memoryIds: Array<Types.ObjectId | string>,
    retentionHours: number,
    minIntervalMs?: number,
  ) => Promise<void>;
} {
  /**
   * Creates a new memory entry for a user
   * Throws an error if a memory with the same key already exists
   */
  async function createMemory(
    { userId, key, value, tokenCount = 0, agentId }: t.SetMemoryParams,
    options: { retentionHours?: number } = {},
  ): Promise<t.MemoryResult> {
    try {
      if (key?.toLowerCase() === 'nothing') {
        return { ok: false };
      }

      const MemoryEntry = mongoose.models.MemoryEntry;
      const existingMemory = await MemoryEntry.findOne({
        userId,
        key,
        ...partitionFilter(agentId),
      });
      if (existingMemory) {
        throw new Error('Memory with this key already exists');
      }

      const now = new Date();
      await MemoryEntry.create({
        userId,
        key,
        value,
        tokenCount,
        ...(agentId ? { agentId } : {}),
        updated_at: now,
        ...(options.retentionHours != null
          ? {
              lastActivityAt: now,
              expiredAt: new Date(now.getTime() + options.retentionHours * 60 * 60 * 1000),
            }
          : {}),
      });

      return { ok: true };
    } catch (error) {
      throw new Error(
        `Failed to create memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Sets or updates a memory entry for a user
   */
  async function setMemory(
    { userId, key, value, tokenCount = 0, agentId }: t.SetMemoryParams,
    options: { retentionHours?: number } = {},
  ): Promise<t.MemoryResult> {
    try {
      if (key?.toLowerCase() === 'nothing') {
        return { ok: false };
      }

      const MemoryEntry = mongoose.models.MemoryEntry;
      const now = new Date();
      await MemoryEntry.findOneAndUpdate(
        { userId, key, ...partitionFilter(agentId) },
        {
          value,
          tokenCount,
          ...(agentId ? { agentId } : {}),
          updated_at: now,
          ...(options.retentionHours != null
            ? {
                lastActivityAt: now,
                expiredAt: new Date(now.getTime() + options.retentionHours * 60 * 60 * 1000),
              }
            : {}),
        },
        {
          upsert: true,
          new: true,
        },
      );

      return { ok: true };
    } catch (error) {
      throw new Error(
        `Failed to set memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Deletes a specific memory entry for a user
   */
  async function deleteMemory({
    userId,
    key,
    agentId,
  }: t.DeleteMemoryParams): Promise<t.MemoryResult> {
    try {
      const MemoryEntry = mongoose.models.MemoryEntry;
      const result = await MemoryEntry.findOneAndDelete({
        userId,
        key,
        ...partitionFilter(agentId),
      });
      return { ok: !!result };
    } catch (error) {
      throw new Error(
        `Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /** Updates an existing memory without requiring its authored key. */
  async function setMemoryById(
    { userId, id, key, value, tokenCount = 0, agentId }: t.SetMemoryByIdParams,
    options: { retentionHours?: number } = {},
  ): Promise<t.SetMemoryByIdResult> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id) || key?.toLowerCase() === 'nothing') {
        return { ok: false };
      }

      const MemoryEntry = mongoose.models.MemoryEntry;
      const recordFilter = { _id: id, userId, ...partitionFilter(agentId) };
      const existingMemory = (await MemoryEntry.findOne(
        recordFilter,
      ).lean()) as t.IMemoryEntryLean | null;
      if (!existingMemory) {
        return { ok: false };
      }

      if (key != null && key !== existingMemory.key) {
        const duplicate = await MemoryEntry.exists({
          userId,
          key,
          ...partitionFilter(agentId),
          _id: { $ne: existingMemory._id },
        });
        if (duplicate) {
          return { ok: false, conflict: true };
        }
      }

      const now = new Date();
      const updatedMemory = (await MemoryEntry.findOneAndUpdate(
        recordFilter,
        {
          ...(key != null ? { key } : {}),
          value,
          tokenCount,
          updated_at: now,
          ...(options.retentionHours != null
            ? {
                lastActivityAt: now,
                expiredAt: new Date(now.getTime() + options.retentionHours * 60 * 60 * 1000),
              }
            : {}),
        },
        { new: true, runValidators: true },
      ).lean()) as t.IMemoryEntryLean | null;

      return updatedMemory ? { ok: true, memory: updatedMemory } : { ok: false };
    } catch (error) {
      throw new Error(
        `Failed to update memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /** Deletes an existing memory without requiring its authored key. */
  async function deleteMemoryById({
    userId,
    id,
    agentId,
  }: t.MemoryByIdParams): Promise<t.MemoryResult> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return { ok: false };
      }

      const MemoryEntry = mongoose.models.MemoryEntry;
      const result = await MemoryEntry.findOneAndDelete({
        _id: id,
        userId,
        ...partitionFilter(agentId),
      });
      return { ok: !!result };
    } catch (error) {
      throw new Error(
        `Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets all memory entries for a user across every partition
   */
  async function getAllUserMemories(
    userId: string | Types.ObjectId,
  ): Promise<t.IMemoryEntryLean[]> {
    try {
      const MemoryEntry = mongoose.models.MemoryEntry;
      return (await MemoryEntry.find({ userId }).lean()) as t.IMemoryEntryLean[];
    } catch (error) {
      throw new Error(
        `Failed to get all memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets a user's memory entries for a single partition
   * (the shared personal pool when `agentId` is omitted)
   */
  async function getUserMemories({
    userId,
    agentId,
  }: t.GetUserMemoriesParams): Promise<t.IMemoryEntryLean[]> {
    try {
      const MemoryEntry = mongoose.models.MemoryEntry;
      return (await MemoryEntry.find({
        userId,
        ...partitionFilter(agentId),
      }).lean()) as t.IMemoryEntryLean[];
    } catch (error) {
      throw new Error(
        `Failed to get memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets and formats a partition's memories for a user in two different formats
   */
  async function getFormattedMemories({
    userId,
    agentId,
  }: t.GetFormattedMemoriesParams): Promise<t.FormattedMemoriesResult> {
    try {
      const memories = await getUserMemories({ userId, agentId });

      if (!memories || memories.length === 0) {
        return {
          withKeys: '',
          withoutKeys: '',
          totalTokens: 0,
          tokenCountsByKey: new Map<string, number>(),
          memoryIds: [],
        };
      }

      const sortedMemories = memories.sort(
        (a, b) => new Date(a.updated_at!).getTime() - new Date(b.updated_at!).getTime(),
      );

      const { totalTokens, tokenCountsByKey } = sortedMemories.reduce(
        (counts, memory) => {
          const tokenCount = memory.tokenCount || 0;
          counts.totalTokens += tokenCount;
          counts.tokenCountsByKey.set(memory.key, tokenCount);
          return counts;
        },
        { totalTokens: 0, tokenCountsByKey: new Map<string, number>() },
      );

      const withKeys = sortedMemories
        .map((memory, index) => {
          const date = formatDate(new Date(memory.updated_at!));
          const tokenInfo = memory.tokenCount ? ` [${memory.tokenCount} tokens]` : '';
          return `${index + 1}. [${date}]. ["key": "${memory.key}"]${tokenInfo}. ["value": "${memory.value}"]`;
        })
        .join('\n\n');

      const withoutKeys = sortedMemories
        .map((memory, index) => {
          const date = formatDate(new Date(memory.updated_at!));
          return `${index + 1}. [${date}]. ${memory.value}`;
        })
        .join('\n\n');

      const memoryIds = sortedMemories.map((memory) => memory._id);

      return { withKeys, withoutKeys, totalTokens, tokenCountsByKey, memoryIds };
    } catch (error) {
      logger.error('Failed to get formatted memories:', error);
      /** Keep the current error handling without presenting a read failure
       *  as an eligible, empty memory partition to prompt consumers. */
      return {
        withKeys: undefined,
        withoutKeys: undefined,
        totalTokens: 0,
        tokenCountsByKey: new Map<string, number>(),
        readFailed: true,
      };
    }
  }

  /**
   * Deletes all memory entries for a user
   */
  async function deleteAllUserMemories(userId: string | Types.ObjectId): Promise<number> {
    try {
      const MemoryEntry = mongoose.models.MemoryEntry;
      const result = await MemoryEntry.deleteMany({ userId });
      return result.deletedCount;
    } catch (error) {
      throw new Error(
        `Failed to delete all user memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Leases up to `limit` expired memories for the retention purge sweep.
   * Mirrors `claimExpiredSkills`/`claimExpiredAgents`: each claim is a
   * conditional `findOneAndUpdate` per candidate, atomic without relying on
   * DocumentDB's unsupported pipeline-form updates. A memory already leased
   * by a live claim is skipped; one whose lease expired (`purgeClaimedAt`
   * older than `leaseMs`) is reclaimed. Memory has no admin exemption lever,
   * so eligibility here is expiry alone — see `classifyMemoryPurgeEligibility`
   * in `@librechat/api` for the (identity-map) post-claim classification step.
   */
  async function claimExpiredMemories(
    limit: number,
    { leaseMs, now = new Date() }: { leaseMs: number; now?: Date },
  ): Promise<ClaimedPurgeMemory[]> {
    const MemoryEntry = mongoose.models.MemoryEntry as Model<t.IMemoryEntry>;
    const leaseExpiry = new Date(now.getTime() - leaseMs);
    const unclaimedOrExpiredLease = {
      $or: [{ purgeClaimId: { $exists: false } }, { purgeClaimedAt: { $lte: leaseExpiry } }],
    };
    const eligibilityFilter = {
      expiredAt: { $lte: now },
      $and: [
        { $or: [{ purgeNotBefore: { $exists: false } }, { purgeNotBefore: { $lte: now } }] },
        unclaimedOrExpiredLease,
      ],
    } as FilterQuery<t.IMemoryEntry>;

    const candidates = await MemoryEntry.find(eligibilityFilter)
      .select({ _id: 1, userId: 1, tenantId: 1 })
      .sort({ expiredAt: 1 })
      .limit(limit)
      .lean<Array<Pick<t.IMemoryEntry, '_id' | 'userId' | 'tenantId'>>>();

    const claimed: ClaimedPurgeMemory[] = [];
    for (const candidate of candidates) {
      const purgeClaimId = crypto.randomUUID();
      const result = await MemoryEntry.findOneAndUpdate(
        { _id: candidate._id, ...eligibilityFilter },
        { $set: { purgeClaimId, purgeClaimedAt: now }, $inc: { purgeAttempts: 1 } },
        { new: true },
      ).lean<Pick<t.IMemoryEntry, '_id' | 'userId' | 'tenantId' | 'purgeAttempts'> | null>();

      if (result?._id != null) {
        claimed.push({
          resourceId: String(result._id),
          userId: String(result.userId),
          tenantId: result.tenantId,
          purgeClaimId,
          purgeAttempts: result.purgeAttempts ?? 1,
        });
      }
    }

    return claimed;
  }

  /**
   * Releases a purge claim after the sweep either finished the delete
   * (`success: true`) or failed/declined it (`success: false`, parking the
   * row behind `purgeNotBefore` for `retryDelayMs`). Mirrors
   * `releaseSkillPurgeClaim`/`releaseAgentPurgeClaim`.
   */
  async function releaseMemoryPurgeClaim(
    resourceId: Types.ObjectId | string,
    { success, retryDelayMs, purgeClaimId }: ReleaseMemoryPurgeClaimOptions,
  ): Promise<void> {
    const MemoryEntry = mongoose.models.MemoryEntry as Model<t.IMemoryEntry>;
    const update: FilterQuery<t.IMemoryEntry> = {
      $unset: { purgeClaimId: '', purgeClaimedAt: '' },
    };
    if (!success) {
      update.$set = { purgeNotBefore: new Date(Date.now() + (retryDelayMs ?? 0)) };
    }
    await MemoryEntry.updateOne({ _id: resourceId, purgeClaimId }, update);
  }

  /**
   * Re-checks time-sensitive purge eligibility (expiry) and claim ownership
   * immediately before the destructive delete, closing the gap between
   * `claimExpiredMemories` and `deleteMemoryById`. A use or update that
   * refreshed `expiredAt` after the claim was taken makes this resolve to
   * `null`, aborting the delete instead of removing a memory that's no
   * longer eligible.
   */
  async function confirmMemoryPurgeEligible(
    memoryId: Types.ObjectId | string,
    purgeClaimId: string,
    now: Date = new Date(),
  ): Promise<Pick<t.IMemoryEntry, '_id'> | null> {
    const MemoryEntry = mongoose.models.MemoryEntry as Model<t.IMemoryEntry>;
    return await MemoryEntry.findOne({
      _id: memoryId,
      purgeClaimId,
      expiredAt: { $lte: now },
    })
      .select({ _id: 1 })
      .lean<Pick<t.IMemoryEntry, '_id'> | null>();
  }

  /**
   * Fire-and-forget activity touch for memories used in a turn. Throttled to
   * a single write per `minIntervalMs` window (default 1 hour) via a guard on
   * the update filter, so repeat use of the same memory within the window is
   * a no-op write rather than one write per turn.
   */
  async function touchMemoriesLastActivity(
    memoryIds: Array<Types.ObjectId | string>,
    retentionHours: number,
    minIntervalMs: number = 60 * 60 * 1000,
  ): Promise<void> {
    if (memoryIds.length === 0) {
      return;
    }
    const MemoryEntry = mongoose.models.MemoryEntry as Model<t.IMemoryEntry>;
    const now = new Date();
    const throttleWindow = new Date(now.getTime() - minIntervalMs);
    await MemoryEntry.updateMany(
      {
        _id: { $in: memoryIds },
        $or: [{ lastActivityAt: { $exists: false } }, { lastActivityAt: { $lte: throttleWindow } }],
      },
      {
        $set: {
          lastActivityAt: now,
          expiredAt: new Date(now.getTime() + retentionHours * 60 * 60 * 1000),
        },
      },
    );
  }

  return {
    setMemory,
    createMemory,
    deleteMemory,
    setMemoryById,
    deleteMemoryById,
    getAllUserMemories,
    getUserMemories,
    getFormattedMemories,
    deleteAllUserMemories,
    claimExpiredMemories,
    releaseMemoryPurgeClaim,
    confirmMemoryPurgeEligible,
    touchMemoriesLastActivity,
  };
}

export type MemoryMethods = ReturnType<typeof createMemoryMethods>;
