// Deloitte Custom Change: Retention Update
import type { Connection, Types } from 'mongoose';
import { DEFAULT_FILE_RETENTION_HOURS } from '~/utils/retention';
import logger from '~/config/winston';

interface FileRetentionBackfillRow {
  _id: Types.ObjectId;
  lastUsedAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
}

const MIGRATION_BATCH_SIZE = 500;
const ELIGIBLE_FILTER = { expiredAt: null } as const;
const FIND_OPTIONS = {
  projection: { _id: 1, lastUsedAt: 1, updatedAt: 1, createdAt: 1 },
  readPreference: 'primary' as const,
  readConcern: { level: 'majority' as const },
};

export interface FileRetentionBackfillResult {
  scanned: number;
  updated: number;
}

export interface FileRetentionBackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
}

/**
 * Backfills `expiredAt` (and `lastUsedAt`, if not already set) on every file row that
 * has no `expiredAt` yet. The anchor is the row's own existing `lastUsedAt` if present —
 * which only happens when an earlier version of this migration already ran against it
 * and left `expiredAt` unset — otherwise `updatedAt`, falling back to `createdAt`.
 * `expiredAt` is `anchor + DEFAULT_FILE_RETENTION_HOURS`; a row dormant longer than that
 * window gets an `expiredAt` already in the past and becomes immediately eligible for
 * the next purge sweep.
 *
 * Deliberate simplification vs. the live touch path: when no independent
 * `fileRetentionHours` is configured, a live file touch inherits its owning
 * conversation's own `expiredAt` (`packages/api/src/files/retention.ts`). That path is
 * request-scoped (reads live config, joins the conversation) and not portable to an
 * offline bulk migration, so this backfill applies the flat `DEFAULT_FILE_RETENTION_HOURS`
 * default uniformly instead.
 *
 * Idempotent: the filter only ever matches rows where `expiredAt` is still unset, so a
 * completed row is never revisited and a crash mid-run just resumes with the remainder.
 */
export async function backfillFileRetention(
  connection: Connection,
  options?: FileRetentionBackfillOptions,
): Promise<FileRetentionBackfillResult> {
  const collection = connection.db!.collection<FileRetentionBackfillRow>('files');
  const batchSize = options?.batchSize ?? MIGRATION_BATCH_SIZE;
  const dryRun = options?.dryRun === true;

  logger.info('[FileRetentionMigration] Starting backfill', { dryRun, batchSize });

  let scanned = 0;
  let updated = 0;
  let batch: Array<{
    updateOne: {
      filter: { _id: Types.ObjectId };
      update: { $set: { lastUsedAt: Date; expiredAt: Date } };
    };
  }> = [];

  for await (const row of collection.find(ELIGIBLE_FILTER, FIND_OPTIONS)) {
    scanned++;
    const anchor = row.lastUsedAt ?? row.updatedAt ?? row.createdAt ?? new Date();
    const expiredAt = new Date(anchor.getTime() + DEFAULT_FILE_RETENTION_HOURS * 60 * 60 * 1000);
    if (dryRun) {
      updated++;
      continue;
    }
    batch.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { lastUsedAt: anchor, expiredAt } },
      },
    });
    if (batch.length === batchSize) {
      // eslint-disable-next-line no-restricted-syntax -- offline all-tenant migration intentionally bypasses request tenant scoping
      const result = await collection.bulkWrite(batch, { ordered: false });
      updated += result.modifiedCount;
      logger.debug('[FileRetentionMigration] Flushed batch', {
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
    logger.debug('[FileRetentionMigration] Flushed batch', {
      batchUpdated: result.modifiedCount,
      totalUpdated: updated,
    });
  }

  logger.info('[FileRetentionMigration] Backfill complete', { scanned, updated, dryRun });

  return { scanned, updated };
}
