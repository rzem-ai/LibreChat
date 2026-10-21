// Deloitte Custom Change: Retention Update
import type { Connection, Types } from 'mongoose';
import { DEFAULT_AGENT_RETENTION_HOURS } from '~/utils/retention';
import logger from '~/config/winston';

interface AgentRetentionBackfillRow {
  _id: Types.ObjectId;
  lastActivityAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
}

const MIGRATION_BATCH_SIZE = 500;
const ELIGIBLE_FILTER = {
  expiredAt: null,
  'retentionException.exempt': { $ne: true },
} as const;
const FIND_OPTIONS = {
  projection: { _id: 1, lastActivityAt: 1, updatedAt: 1, createdAt: 1 },
  readPreference: 'primary' as const,
  readConcern: { level: 'majority' as const },
};

export interface AgentRetentionBackfillResult {
  scanned: number;
  updated: number;
}

export interface AgentRetentionBackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
}

/**
 * Backfills `expiredAt` (and `lastActivityAt`, if not already set) on every agent row
 * that has no `expiredAt` yet. The anchor is the row's own existing `lastActivityAt` if
 * present — which only happens when an earlier version of this migration already ran
 * against it and left `expiredAt` unset — otherwise `updatedAt`, falling back to
 * `createdAt`. `expiredAt` is `anchor + DEFAULT_AGENT_RETENTION_HOURS`; a row dormant
 * longer than that window gets an `expiredAt` already in the past and becomes
 * immediately eligible for the next purge sweep. Rows with `retentionException.exempt`
 * are skipped and stay permanently unexpiring. Idempotent: the filter only ever matches
 * rows where `expiredAt` is still unset, so a completed row is never revisited and a
 * crash mid-run just resumes with the remainder.
 */
export async function backfillAgentRetention(
  connection: Connection,
  options?: AgentRetentionBackfillOptions,
): Promise<AgentRetentionBackfillResult> {
  const collection = connection.db!.collection<AgentRetentionBackfillRow>('agents');
  const batchSize = options?.batchSize ?? MIGRATION_BATCH_SIZE;
  const dryRun = options?.dryRun === true;

  logger.info('[AgentRetentionMigration] Starting backfill', { dryRun, batchSize });

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
    const anchor = row.lastActivityAt ?? row.updatedAt ?? row.createdAt ?? new Date();
    const expiredAt = new Date(anchor.getTime() + DEFAULT_AGENT_RETENTION_HOURS * 60 * 60 * 1000);
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
      logger.debug('[AgentRetentionMigration] Flushed batch', {
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
    logger.debug('[AgentRetentionMigration] Flushed batch', {
      batchUpdated: result.modifiedCount,
      totalUpdated: updated,
    });
  }

  logger.info('[AgentRetentionMigration] Backfill complete', { scanned, updated, dryRun });

  return { scanned, updated };
}
