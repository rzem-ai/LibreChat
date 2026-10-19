// Deloitte Custom Change: Retention Update
import type { Connection, Types } from 'mongoose';

interface FileRetentionBackfillRow {
  _id: Types.ObjectId;
  updatedAt?: Date;
  createdAt?: Date;
}

const MIGRATION_BATCH_SIZE = 500;
const ELIGIBLE_FILTER = { lastUsedAt: { $exists: false } } as const;
const FIND_OPTIONS = {
  projection: { _id: 1, updatedAt: 1, createdAt: 1 },
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
 * Backfills `lastUsedAt` on every file row that predates the field's
 * introduction, using `updatedAt` (falling back to `createdAt`) as the best
 * available proxy for "last touched". Idempotent: the filter only ever
 * matches rows where the field does not exist yet, so a completed row is
 * never revisited and a crash mid-run just resumes with the remainder.
 */
export async function backfillFileRetention(
  connection: Connection,
  options?: FileRetentionBackfillOptions,
): Promise<FileRetentionBackfillResult> {
  const collection = connection.db!.collection<FileRetentionBackfillRow>('files');
  const batchSize = options?.batchSize ?? MIGRATION_BATCH_SIZE;
  const dryRun = options?.dryRun === true;

  let scanned = 0;
  let updated = 0;
  let batch: Array<{
    updateOne: { filter: { _id: Types.ObjectId }; update: { $set: { lastUsedAt: Date } } };
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
        update: { $set: { lastUsedAt: anchor } },
      },
    });
    if (batch.length === batchSize) {
      // eslint-disable-next-line no-restricted-syntax -- offline all-tenant migration intentionally bypasses request tenant scoping
      const result = await collection.bulkWrite(batch, { ordered: false });
      updated += result.modifiedCount;
      batch = [];
    }
  }
  if (batch.length) {
    // eslint-disable-next-line no-restricted-syntax -- offline all-tenant migration intentionally bypasses request tenant scoping
    const result = await collection.bulkWrite(batch, { ordered: false });
    updated += result.modifiedCount;
  }

  return { scanned, updated };
}
