// Deloitte Custom Change: Retention Update
import type { Connection, Types } from 'mongoose';
import logger from '~/config/winston';

interface SkillRetentionBackfillRow {
  _id: Types.ObjectId;
  updatedAt?: Date;
  createdAt?: Date;
}

const MIGRATION_BATCH_SIZE = 500;
const ELIGIBLE_FILTER = { lastActivityAt: { $exists: false } } as const;
const FIND_OPTIONS = {
  projection: { _id: 1, updatedAt: 1, createdAt: 1 },
  readPreference: 'primary' as const,
  readConcern: { level: 'majority' as const },
};

export interface SkillRetentionBackfillResult {
  scanned: number;
  updated: number;
}

export interface SkillRetentionBackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
}

/**
 * Backfills `lastActivityAt` on every skill row that predates the field's
 * introduction, using `updatedAt` (falling back to `createdAt`) as the best
 * available proxy for "last touched". `expiredAt` is deliberately left unset —
 * it is only populated the next time the skill is created/edited/used/renewed,
 * so an already-dormant skill does not retroactively become immediately
 * purge-eligible at rollout. Idempotent: the filter only ever matches rows
 * where the field does not exist yet, so a completed row is never revisited
 * and a crash mid-run just resumes with the remainder.
 */
export async function backfillSkillRetention(
  connection: Connection,
  options?: SkillRetentionBackfillOptions,
): Promise<SkillRetentionBackfillResult> {
  const collection = connection.db!.collection<SkillRetentionBackfillRow>('skills');
  const batchSize = options?.batchSize ?? MIGRATION_BATCH_SIZE;
  const dryRun = options?.dryRun === true;

  logger.info('[SkillRetentionMigration] Starting backfill', { dryRun, batchSize });

  let scanned = 0;
  let updated = 0;
  let batch: Array<{
    updateOne: { filter: { _id: Types.ObjectId }; update: { $set: { lastActivityAt: Date } } };
  }> = [];

  for await (const row of collection.find(ELIGIBLE_FILTER, FIND_OPTIONS)) {
    scanned++;
    const anchor = row.updatedAt ?? row.createdAt ?? new Date();
    if (dryRun) {
      updated++;
      continue;
    }
    batch.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { lastActivityAt: anchor } },
      },
    });
    if (batch.length === batchSize) {
      // eslint-disable-next-line no-restricted-syntax -- offline all-tenant migration intentionally bypasses request tenant scoping
      const result = await collection.bulkWrite(batch, { ordered: false });
      updated += result.modifiedCount;
      logger.debug('[SkillRetentionMigration] Flushed batch', {
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
    logger.debug('[SkillRetentionMigration] Flushed batch', {
      batchUpdated: result.modifiedCount,
      totalUpdated: updated,
    });
  }

  logger.info('[SkillRetentionMigration] Backfill complete', { scanned, updated, dryRun });

  return { scanned, updated };
}
