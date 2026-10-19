// Deloitte Custom Change: Retention Update
import type { Connection } from 'mongoose';
import { buildIndexWithRetry } from '~/utils/retry';
import logger from '~/config/winston';

const TTL_INDEX_NAME = 'expiredAt_1';

/**
 * Replacement index for each collection, matching `convoSchema`/`messageSchema` exactly.
 * Hardcoded rather than read off the live schema so this migration's behavior stays fixed
 * at the point RET-02 shipped, independent of later unrelated schema changes.
 */
const REPLACEMENT_INDEXES: Record<string, { keys: Record<string, 1>; name: string }> = {
  conversations: {
    keys: { expiredAt: 1, purgeNotBefore: 1 },
    name: 'expiredAt_1_purgeNotBefore_1',
  },
  messages: { keys: { expiredAt: 1 }, name: TTL_INDEX_NAME },
};

interface MigrationResult {
  dropped: string[];
  created: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Drops the native MongoDB TTL index on `expiredAt` for conversations and messages, then
 * creates the app-owned replacement indexes the purge sweep relies on —
 * `{ expiredAt: 1, purgeNotBefore: 1 }` on conversations, `{ expiredAt: 1 }` on messages,
 * neither carrying `expireAfterSeconds`. A native TTL delete removes only the matched
 * document directly, bypassing the cascade (tool calls, shared links, agent generations,
 * checkpoints) that only `purgeConversationCascade` runs, so the TTL index must be gone
 * before any conversation is allowed to reach its `expiredAt` deadline.
 *
 * Idempotent — skips a collection whose TTL index is already gone (including a fresh
 * database, where the schema-defined index was never a TTL index to begin with).
 *
 * Rollout ordering: deploy the purge worker (`startConversationPurgeSweep`) and run this
 * migration together, in the same release — the worker is what replaces the deletions the
 * TTL index used to perform. Never run `backfillConversationRetention` (RET-01) against a
 * database where the TTL index is still live and the worker is not yet running: a
 * backfilled `expiredAt` would otherwise be deleted by Mongo's TTL monitor without ever
 * passing through the cascade.
 */
export async function dropRetentionTTLIndexes(
  connection: Connection,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<MigrationResult> {
  const result: MigrationResult = { dropped: [], created: [], skipped: [], errors: [] };

  for (const [collectionName, replacement] of Object.entries(REPLACEMENT_INDEXES)) {
    const collection = connection.db!.collection(collectionName);

    let existingIndexes: Array<{ name?: string; expireAfterSeconds?: number }>;
    try {
      existingIndexes = await collection.indexes();
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 26) {
        result.skipped.push(`${collectionName}.${TTL_INDEX_NAME} (collection does not exist)`);
        continue;
      }
      const msg = `${collectionName}: ${(err as Error).message}`;
      result.errors.push(msg);
      logger.error(`[RetentionTTLMigration] Failed to list indexes: ${msg}`);
      continue;
    }

    const ttlIndex = existingIndexes.find(
      (idx) => idx.name === TTL_INDEX_NAME && idx.expireAfterSeconds != null,
    );

    if (!ttlIndex) {
      result.skipped.push(`${collectionName}.${TTL_INDEX_NAME}`);
      continue;
    }

    if (dryRun) {
      logger.info(`[RetentionTTLMigration] Would drop: ${collectionName}.${TTL_INDEX_NAME}`);
      logger.info(
        `[RetentionTTLMigration] Would create: ${collectionName}.${replacement.name} ${JSON.stringify(replacement.keys)}`,
      );
      continue;
    }

    try {
      await collection.dropIndex(TTL_INDEX_NAME);
      result.dropped.push(`${collectionName}.${TTL_INDEX_NAME}`);
      logger.info(`[RetentionTTLMigration] Dropped TTL index: ${collectionName}.${TTL_INDEX_NAME}`);
    } catch (err) {
      const msg = `${collectionName}.${TTL_INDEX_NAME}: ${(err as Error).message}`;
      result.errors.push(msg);
      logger.error(`[RetentionTTLMigration] Failed to drop TTL index: ${msg}`);
      continue;
    }

    try {
      await buildIndexWithRetry(
        () => collection.createIndex(replacement.keys, { name: replacement.name }),
        `createIndex(${collectionName}.${replacement.name})`,
      );
      result.created.push(`${collectionName}.${replacement.name}`);
      logger.info(
        `[RetentionTTLMigration] Created replacement index: ${collectionName}.${replacement.name}`,
      );
    } catch (err) {
      const msg = `${collectionName}.${replacement.name}: ${(err as Error).message}`;
      result.errors.push(msg);
      logger.error(`[RetentionTTLMigration] Failed to create replacement index: ${msg}`);
    }
  }

  logger.info(
    `[RetentionTTLMigration] ${dryRun ? 'Dry run' : 'Migration'} complete: ` +
      `${result.dropped.length} dropped, ${result.created.length} created, ${result.errors.length} errors.`,
  );

  return result;
}
