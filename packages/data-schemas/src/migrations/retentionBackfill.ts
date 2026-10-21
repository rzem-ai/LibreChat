// Deloitte Custom Change: Retention Update
import type { Connection, Types } from 'mongoose';
import { DEFAULT_RETENTION_HOURS } from '~/utils/tempChatRetention';
import logger from '~/config/winston';

interface RetentionBackfillRow {
  _id: Types.ObjectId;
}

interface ConversationRetentionBackfillRow {
  _id: Types.ObjectId;
  lastActivityAt?: Date;
  createdAt?: Date;
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
const CONVERSATION_FIND_OPTIONS = {
  projection: { _id: 1, lastActivityAt: 1, createdAt: 1 },
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
  /** Deterministic "now" for tests; also the per-row anchor fallback for conversations. */
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

// Deloitte Custom Change: Retention Update
/**
 * Backfills `expiredAt` on every legacy conversation that still has none, anchored per-row to
 * `lastActivityAt ?? createdAt ?? now` — the same anchor chain as agents/skills/files/memory
 * (`agentRetentionBackfill.ts` et al.). A conversation dormant longer than
 * `DEFAULT_RETENTION_HOURS` gets an `expiredAt` already in the past and becomes immediately
 * eligible for the next purge sweep.
 *
 * This supersedes the collection's former "LD-02" policy of stamping every row with one shared,
 * run-time-anchored deadline specifically to avoid a mass purge on first run. That tradeoff is a
 * confirmed, intentional reversal: conversations now behave like every other retained resource
 * type rather than being a special case, and a dormant-conversation purge on first run is the
 * accepted (and expected) outcome.
 *
 * Idempotent: the filter only ever matches rows where `expiredAt` is still unset, so a completed
 * row is never revisited and a crash mid-run just resumes with the remainder.
 */
async function backfillConversationRetentionCollection(
  connection: Connection,
  options?: RetentionBackfillOptions,
): Promise<RetentionBackfillResult> {
  const collection = connection.db!.collection<ConversationRetentionBackfillRow>('conversations');
  const batchSize = options?.batchSize ?? MIGRATION_BATCH_SIZE;
  const dryRun = options?.dryRun === true;
  const now = options?.now ?? new Date();

  logger.info('[ConversationRetentionMigration] Starting backfill', {
    collectionName: 'conversations',
    dryRun,
    batchSize,
  });

  let scanned = 0;
  let updated = 0;
  let batch: Array<{
    updateOne: { filter: { _id: Types.ObjectId }; update: { $set: { expiredAt: Date } } };
  }> = [];

  for await (const row of collection.find(ELIGIBLE_FILTER, CONVERSATION_FIND_OPTIONS)) {
    scanned++;
    const anchor = row.lastActivityAt ?? row.createdAt ?? now;
    const expiredAt = new Date(anchor.getTime() + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);
    if (dryRun) {
      updated++;
      continue;
    }
    batch.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { expiredAt } },
      },
    });
    if (batch.length === batchSize) {
      // eslint-disable-next-line no-restricted-syntax -- offline all-tenant migration intentionally bypasses request tenant scoping
      const result = await collection.bulkWrite(batch, { ordered: false });
      updated += result.modifiedCount;
      logger.debug('[ConversationRetentionMigration] Flushed batch', {
        collectionName: 'conversations',
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
      collectionName: 'conversations',
      batchUpdated: result.modifiedCount,
      totalUpdated: updated,
    });
  }

  logger.info('[ConversationRetentionMigration] Backfill complete', {
    collectionName: 'conversations',
    scanned,
    updated,
    dryRun,
  });

  return { scanned, updated };
}

/**
 * Backfills a 30-day retention deadline (from this run's own clock — not each row's `createdAt`)
 * onto every legacy message that predates the default-retention change and still has no
 * `expiredAt`. Messages are never purged by their own `expiredAt` — they're deleted by
 * `purgeConversationCascade` alongside their conversation — so this shared, run-time-anchored
 * deadline (rather than a per-row activity anchor) remains the correct, simpler choice here.
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

  const conversations = await backfillConversationRetentionCollection(connection, options);
  const messages = await backfillCollection(connection, 'messages', deadline, options);

  return { conversations, messages };
}
