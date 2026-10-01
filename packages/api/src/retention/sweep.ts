import type { PurgeCascadeDeps } from '~/conversations/purgeCascade';
import { purgeConversationCascade } from '~/conversations/purgeCascade';

const DEFAULT_CONVERSATION_PURGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_CONVERSATION_PURGE_BATCH_SIZE = 200;
const DEFAULT_CONVERSATION_PURGE_MAX_ATTEMPTS = 10;
const DEFAULT_CONVERSATION_PURGE_CLAIM_LEASE_MS = 10 * 60 * 1000;
const MIN_CONVERSATION_PURGE_RETRY_BASE_MS = 60 * 1000;
const CONVERSATION_PURGE_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
const CONVERSATION_PURGE_PARK_MS = 30 * 24 * 60 * 60 * 1000;

/** A conversation this tick successfully leased, ready for the cascade. */
export type ClaimedPurgeConversation = {
  conversationId: string;
  user: string;
  tenantId?: string;
  purgeClaimId: string;
  purgeAttempts: number;
};

type SweepLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string, error?: unknown) => void;
};

type PurgeSweepDependencies<TDeleteConvosResult extends { conversationIds: string[] }> = {
  claimExpiredConversations: (
    limit: number,
    options: { leaseMs: number; now?: Date },
  ) => Promise<ClaimedPurgeConversation[]>;
  releaseConversationPurgeClaim: (
    conversationId: string,
    options: { success: boolean; retryDelayMs?: number },
  ) => Promise<void>;
  cascadeDeps: PurgeCascadeDeps<TDeleteConvosResult>;
  logger: SweepLogger;
};

type StartPurgeSweepDependencies = {
  purgeExpiredConversations: (options?: PurgeSweepOptions) => Promise<PurgeSweepResult>;
  runAsSystem: <T>(fn: () => Promise<T>) => Promise<T>;
  isLeader: () => Promise<boolean>;
  logger: SweepLogger;
};

export type PurgeSweepOptions = {
  limit?: number;
  now?: Date;
};

export type PurgeSweepResult = {
  scanned: number;
  purged: number;
  failed: number;
};

export function getConversationPurgeSweepInterval(
  interval: string | undefined = process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS,
): number {
  if (interval == null || interval.trim() === '') {
    return DEFAULT_CONVERSATION_PURGE_SWEEP_INTERVAL_MS;
  }

  const value = Number(interval);
  if (!Number.isFinite(value) || value < 0 || (value > 0 && value < 1)) {
    return DEFAULT_CONVERSATION_PURGE_SWEEP_INTERVAL_MS;
  }
  return value;
}

export function getConversationPurgeBatchSize(
  batchSize: string | undefined = process.env.CONVERSATION_PURGE_BATCH_SIZE,
): number {
  if (batchSize == null || batchSize.trim() === '') {
    return DEFAULT_CONVERSATION_PURGE_BATCH_SIZE;
  }

  const value = Number(batchSize);
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_CONVERSATION_PURGE_BATCH_SIZE;
  }
  return value;
}

/**
 * Consecutive failures after which a conversation is parked rather than retried on
 * the ordinary ladder. Mirrors `getFileRetentionMaxAttempts` — see that function for
 * why lowering it speeds through a backlog of conversations stuck on the same defect.
 */
export function getConversationPurgeMaxAttempts(
  maxAttempts: string | undefined = process.env.CONVERSATION_PURGE_SWEEP_MAX_ATTEMPTS,
): number {
  if (maxAttempts == null || maxAttempts.trim() === '') {
    return DEFAULT_CONVERSATION_PURGE_MAX_ATTEMPTS;
  }

  const value = Number(maxAttempts);
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_CONVERSATION_PURGE_MAX_ATTEMPTS;
  }
  return value;
}

/** How long a claim holds a conversation before another sweep tick may reclaim it as
 * abandoned. Must comfortably exceed one cascade's worst-case duration — a lease
 * shorter than that double-runs the cascade for every conversation whose deletion
 * is still in flight when the lease lapses. */
export function getConversationPurgeClaimLeaseMs(
  leaseMs: string | undefined = process.env.CONVERSATION_PURGE_CLAIM_LEASE_MS,
): number {
  if (leaseMs == null || leaseMs.trim() === '') {
    return DEFAULT_CONVERSATION_PURGE_CLAIM_LEASE_MS;
  }

  const value = Number(leaseMs);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_CONVERSATION_PURGE_CLAIM_LEASE_MS;
  }
  return value;
}

/**
 * Backoff before the next attempt, doubling from one sweep interval up to a day.
 * `attempts` is the conversation's failure count including the one just recorded, so
 * the first retry lands on the following sweep. A conversation that exhausts
 * `maxAttempts` is parked for a month instead, mirroring `getExpiredFileRetryDelay`.
 */
export function getConversationPurgeRetryDelay(attempts: number, maxAttempts: number): number {
  if (attempts >= maxAttempts) {
    return CONVERSATION_PURGE_PARK_MS;
  }

  const interval = getConversationPurgeSweepInterval();
  const base = Math.max(
    interval > 0 ? interval : DEFAULT_CONVERSATION_PURGE_SWEEP_INTERVAL_MS,
    MIN_CONVERSATION_PURGE_RETRY_BASE_MS,
  );
  const exponent = Math.max(0, attempts - 1);
  return Math.min(base * 2 ** exponent, CONVERSATION_PURGE_RETRY_MAX_MS);
}

/**
 * Claims a batch of expired conversations and cascades each one individually: a
 * failure on one conversation releases only that claim with backoff and continues
 * the batch, rather than aborting the remaining claimed conversations.
 */
export async function purgeExpiredConversations<
  TDeleteConvosResult extends { conversationIds: string[] },
>(
  options: PurgeSweepOptions | undefined = {},
  deps: PurgeSweepDependencies<TDeleteConvosResult>,
): Promise<PurgeSweepResult> {
  const { limit = getConversationPurgeBatchSize(), now = new Date() } = options;
  const leaseMs = getConversationPurgeClaimLeaseMs();
  const maxAttempts = getConversationPurgeMaxAttempts();

  const claimed = await deps.claimExpiredConversations(limit, { leaseMs, now });
  let purged = 0;
  let failed = 0;

  for (const conversation of claimed) {
    try {
      await purgeConversationCascade(
        conversation.user,
        conversation.tenantId,
        [conversation.conversationId],
        deps.cascadeDeps,
      );
      await deps.releaseConversationPurgeClaim(conversation.conversationId, { success: true });
      purged++;
    } catch (error) {
      failed++;
      deps.logger.error(
        `[purgeExpiredConversations] Failed to purge conversation ${conversation.conversationId}:`,
        error,
      );
      const retryDelayMs = getConversationPurgeRetryDelay(conversation.purgeAttempts, maxAttempts);
      try {
        await deps.releaseConversationPurgeClaim(conversation.conversationId, {
          success: false,
          retryDelayMs,
        });
      } catch (releaseError) {
        deps.logger.error(
          `[purgeExpiredConversations] Failed to release purge claim for ${conversation.conversationId}:`,
          releaseError,
        );
      }
    }
  }

  if (purged > 0 || failed > 0) {
    deps.logger.info(
      `[purgeExpiredConversations] Processed ${claimed.length} claimed conversations: ${purged} purged, ${failed} failed`,
    );
  }

  return { scanned: claimed.length, purged, failed };
}

export function startConversationPurgeSweep(
  options: PurgeSweepOptions | undefined = {},
  { purgeExpiredConversations, runAsSystem, isLeader, logger }: StartPurgeSweepDependencies,
): NodeJS.Timeout | null {
  const intervalMs = getConversationPurgeSweepInterval();
  if (intervalMs === 0) {
    logger.info('[purgeExpiredConversations] Disabled by CONVERSATION_PURGE_SWEEP_INTERVAL_MS=0');
    return null;
  }

  let isSweeping = false;
  const runSweep = async () => {
    if (isSweeping) {
      return;
    }

    isSweeping = true;
    try {
      if (!(await isLeader())) {
        return;
      }
      await runAsSystem(() => purgeExpiredConversations(options));
    } catch (error) {
      logger.error('[purgeExpiredConversations] Background sweep failed:', error);
    } finally {
      isSweeping = false;
    }
  };

  runSweep();
  const interval = setInterval(runSweep, intervalMs);
  interval.unref?.();
  return interval;
}
