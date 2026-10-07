import type { Connection, Types } from 'mongoose';

interface AgentRetentionBackfillRow {
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

export interface AgentRetentionBackfillResult {
  scanned: number;
  updated: number;
}

export interface AgentRetentionBackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
}

/**
 * Backfills `lastActivityAt` on every agent row that predates the field's
 * introduction, using `updatedAt` (falling back to `createdAt`) as the best
 * available proxy for "last touched". `expiredAt` is deliberately left unset —
 * it is only populated the next time the agent is created/edited/used/renewed,
 * so an already-dormant agent does not retroactively become immediately
 * purge-eligible at rollout. Idempotent: the filter only ever matches rows
 * where the field does not exist yet, so a completed row is never revisited
 * and a crash mid-run just resumes with the remainder.
 */
export async function backfillAgentRetention(
  connection: Connection,
  options?: AgentRetentionBackfillOptions,
): Promise<AgentRetentionBackfillResult> {
  const collection = connection.db!.collection<AgentRetentionBackfillRow>('agents');
  const batchSize = options?.batchSize ?? MIGRATION_BATCH_SIZE;
  const dryRun = options?.dryRun === true;

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
