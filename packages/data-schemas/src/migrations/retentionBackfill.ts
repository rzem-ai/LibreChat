// Deloitte Custom Change: Retention Update
import type { Connection, Types } from 'mongoose';
import { DEFAULT_RETENTION_HOURS } from '~/utils/tempChatRetention';
import logger from '~/config/winston';

interface RetentionBackfillRow {
  _id: Types.ObjectId;
}

const MIGRATION_BATCH_SIZE = 500;
const ELIGIBLE_FILTER = {
  expiredAt: null,
  isTemporary: { $ne: true },
  'retentionException.exempt': { $ne: true },
} as const;
const FIND_OPTIONS = {
  projection: { _id: 1 },
  readPreference: 'primary' as const,
  readConcern: { level: 'majority' as const },
};

export interface RetentionBackfillResult {
  scanned: number;
  updated: number;
}

export interface RetentionBackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
  /** Grace-period anchor for every row in this run — not each row's own `createdAt` (LD-02). */
  now?: Date;
}

async function backfillCollection(
  connection: Connection,
  collectionName: string,
  deadline: Date,
  options?: RetentionBackfillOptions,
): Promise<RetentionBackfillResult> {
  const collection = connection.db!.collection<RetentionBackfillRow>(collectionName);
  const batchSize = options?.batchSize ?? MIGRATION_BATCH_SIZE;
  const dryRun = options?.dryRun === true;

  logger.info('[ConversationRetentionMigration] Starting backfill', {
    collectionName,
    dryRun,
    batchSize,
  });

  let scanned = 0;
  let updated = 0;
  let batch: Array<{
    updateOne: { filter: { _id: Types.ObjectId }; update: { $set: { expiredAt: Date } } };
  }> = [];

  for await (const row of collection.find(ELIGIBLE_FILTER, FIND_OPTIONS)) {
    scanned++;
    if (dryRun) {
      updated++;
      continue;
    }
    batch.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { expiredAt: deadline } },
      },
    });
    if (batch.length === batchSize) {
      // eslint-disable-next-line no-restricted-syntax -- offline all-tenant migration intentionally bypasses request tenant scoping
      const result = await collection.bulkWrite(batch, { ordered: false });
      updated += result.modifiedCount;
      logger.debug('[ConversationRetentionMigration] Flushed batch', {
        collectionName,
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
    logger.debug('[ConversationRetentionMigration] Flushed batch', {
      collectionName,
      batchUpdated: result.modifiedCount,
      totalUpdated: updated,
    });
  }

  logger.info('[ConversationRetentionMigration] Backfill complete', {
    collectionName,
    scanned,
    updated,
    dryRun,
  });

  return { scanned, updated };
}

/**
 * Backfills a 30-day retention deadline (from this run's own clock, per LD-02 — not each row's
 * `createdAt`) onto every legacy conversation/message that predates the default-retention change
 * and still has no `expiredAt`. Idempotent: the filter only ever matches still-null rows, so a
 * completed row is never revisited, and a crash mid-run just resumes with a later (more generous)
 * `now` for the remainder.
 *
 * Must only run after RET-02's purge worker is deployed and the native TTL index is dropped —
 * see `retentionTTLIndex.ts` and the rollout ordering documented alongside it.
 */
export async function backfillConversationRetention(
  connection: Connection,
  options?: RetentionBackfillOptions,
): Promise<{ conversations: RetentionBackfillResult; messages: RetentionBackfillResult }> {
  const migrationRunTime = options?.now ?? new Date();
  const deadline = new Date(migrationRunTime.getTime() + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);

  logger.info('[ConversationRetentionMigration] Starting backfill', {
    dryRun: options?.dryRun === true,
    deadline,
  });

  const conversations = await backfillCollection(connection, 'conversations', deadline, options);
  const messages = await backfillCollection(connection, 'messages', deadline, options);

  return { conversations, messages };
}
