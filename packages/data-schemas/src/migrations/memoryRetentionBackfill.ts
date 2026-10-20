// Deloitte Custom Change: Retention Update
import type { Connection, Types } from 'mongoose';
import { DEFAULT_MEMORY_RETENTION_HOURS } from '~/utils/retention';
import logger from '~/config/winston';

interface MemoryRetentionBackfillRow {
  _id: Types.ObjectId;
  lastActivityAt?: Date;
  updated_at?: Date;
}

const MIGRATION_BATCH_SIZE = 500;
const ELIGIBLE_FILTER = { expiredAt: null } as const;
const FIND_OPTIONS = {
  projection: { _id: 1, lastActivityAt: 1, updated_at: 1 },
  readPreference: 'primary' as const,
  readConcern: { level: 'majority' as const },
};

export interface MemoryRetentionBackfillResult {
  scanned: number;
  updated: number;
}

export interface MemoryRetentionBackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
}

/**
 * Backfills `expiredAt` (and `lastActivityAt`, if not already set) on every memory row
 * that has no `expiredAt` yet. The anchor is the row's own existing `lastActivityAt` if
 * present — which only happens when an earlier version of this migration already ran
 * against it and left `expiredAt` unset — otherwise `updated_at` (memory has no
 * `createdAt` to fall back to). `expiredAt` is `anchor + DEFAULT_MEMORY_RETENTION_HOURS`;
 * a row dormant longer than that window gets an `expiredAt` already in the past and
 * becomes immediately eligible for the next purge sweep. Idempotent: the filter only
 * ever matches rows where `expiredAt` is still unset, so a completed row is never
 * revisited and a crash mid-run just resumes with the remainder.
 */
export async function backfillMemoryRetention(
  connection: Connection,
  options?: MemoryRetentionBackfillOptions,
): Promise<MemoryRetentionBackfillResult> {
  const collection = connection.db!.collection<MemoryRetentionBackfillRow>('memoryentries');
  const batchSize = options?.batchSize ?? MIGRATION_BATCH_SIZE;
  const dryRun = options?.dryRun === true;

  logger.info('[MemoryRetentionMigration] Starting backfill', { dryRun, batchSize });

  let scanned = 0;
  let updated = 0;
  let batch: Array<{
    updateOne: {
      filter: { _id: Types.ObjectId };
      update: { $set: { lastActivityAt: Date; expiredAt: Date } };
    };
  }> = [];

  for await (const row of collection.find(ELIGIBLE_FILTER, FIND_OPTIONS)) {
    scanned++;
    const anchor = row.lastActivityAt ?? row.updated_at ?? new Date();
    const expiredAt = new Date(anchor.getTime() + DEFAULT_MEMORY_RETENTION_HOURS * 60 * 60 * 1000);
    if (dryRun) {
      updated++;
      continue;
    }
    batch.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { lastActivityAt: anchor, expiredAt } },
      },
    });
    if (batch.length === batchSize) {
      // eslint-disable-next-line no-restricted-syntax -- offline all-tenant migration intentionally bypasses request tenant scoping
      const result = await collection.bulkWrite(batch, { ordered: false });
      updated += result.modifiedCount;
      logger.debug('[MemoryRetentionMigration] Flushed batch', {
        batchUpdated: result.modifiedCount,
        totalUpdated: updated,
      });
      batch = [];
    }
  }
  if (batch.length) {
    // eslint-disable-next-line no-restricted-syntax -- offline all-tenant migration intentionally bypasses request tenant scoping
    const result = await collection.bulkWrite(batch, { ordered: false });
    updated += result.modifiedCount;
    logger.debug('[MemoryRetentionMigration] Flushed batch', {
      batchUpdated: result.modifiedCount,
      totalUpdated: updated,
    });
  }

  logger.info('[MemoryRetentionMigration] Backfill complete', { scanned, updated, dryRun });

  return { scanned, updated };
}
