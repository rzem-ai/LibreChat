import type { PurgeCascadeDeps } from '~/conversations/purgeCascade';
import { purgeConversationCascade } from '~/conversations/purgeCascade';

const DEFAULT_CONVERSATION_PURGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_CONVERSATION_PURGE_BATCH_SIZE = 200;
const DEFAULT_CONVERSATION_PURGE_MAX_ATTEMPTS = 10;
const DEFAULT_CONVERSATION_PURGE_CLAIM_LEASE_MS = 10 * 60 * 1000;

const DEFAULT_AGENT_PURGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_AGENT_PURGE_BATCH_SIZE = 200;
const DEFAULT_AGENT_PURGE_MAX_ATTEMPTS = 10;
const DEFAULT_AGENT_PURGE_CLAIM_LEASE_MS = 10 * 60 * 1000;

const DEFAULT_SKILL_PURGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_SKILL_PURGE_BATCH_SIZE = 200;
const DEFAULT_SKILL_PURGE_MAX_ATTEMPTS = 10;
const DEFAULT_SKILL_PURGE_CLAIM_LEASE_MS = 10 * 60 * 1000;

const DEFAULT_MEMORY_PURGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_MEMORY_PURGE_BATCH_SIZE = 200;
const DEFAULT_MEMORY_PURGE_MAX_ATTEMPTS = 10;
const DEFAULT_MEMORY_PURGE_CLAIM_LEASE_MS = 10 * 60 * 1000;

/** Shared backoff bounds — identical ladder shape for every purge-sweep resource type. */
const MIN_PURGE_RETRY_BASE_MS = 60 * 1000;
const PURGE_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
const PURGE_PARK_MS = 30 * 24 * 60 * 60 * 1000;

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
    options: { success: boolean; retryDelayMs?: number; purgeClaimId: string },
  ) => Promise<void>;
  /** Re-checks expiry/exemption/claim ownership immediately before the cascade. */
  confirmConversationPurgeEligible: (
    conversationId: string,
    user: string,
    purgeClaimId: string,
    now?: Date,
  ) => Promise<{ conversationId: string } | null>;
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
 * `attempts` is the resource's failure count including the one just recorded, so
 * the first retry lands on the following sweep. A resource that exhausts
 * `maxAttempts` is parked for a month instead, mirroring `getExpiredFileRetryDelay`.
 * Shared across conversation/agent/skill purge sweeps — each passes its own
 * sweep interval so the backoff ladder follows that resource type's cadence.
 */
export function computePurgeRetryDelay(
  attempts: number,
  maxAttempts: number,
  intervalMs: number,
): number {
  if (attempts >= maxAttempts) {
    return PURGE_PARK_MS;
  }

  const base = Math.max(
    intervalMs > 0 ? intervalMs : DEFAULT_CONVERSATION_PURGE_SWEEP_INTERVAL_MS,
    MIN_PURGE_RETRY_BASE_MS,
  );
  const exponent = Math.max(0, attempts - 1);
  return Math.min(base * 2 ** exponent, PURGE_RETRY_MAX_MS);
}

export function getConversationPurgeRetryDelay(attempts: number, maxAttempts: number): number {
  return computePurgeRetryDelay(attempts, maxAttempts, getConversationPurgeSweepInterval());
}

function resolveSweepIntervalMs(envValue: string | undefined, defaultMs: number): number {
  if (envValue == null || envValue.trim() === '') {
    return defaultMs;
  }
  const value = Number(envValue);
  if (!Number.isFinite(value) || value < 0 || (value > 0 && value < 1)) {
    return defaultMs;
  }
  return value;
}

function resolvePositiveInt(envValue: string | undefined, defaultValue: number): number {
  if (envValue == null || envValue.trim() === '') {
    return defaultValue;
  }
  const value = Number(envValue);
  if (!Number.isInteger(value) || value < 1) {
    return defaultValue;
  }
  return value;
}

export function getAgentPurgeSweepInterval(
  interval: string | undefined = process.env.AGENT_PURGE_SWEEP_INTERVAL_MS,
): number {
  return resolveSweepIntervalMs(interval, DEFAULT_AGENT_PURGE_SWEEP_INTERVAL_MS);
}

export function getAgentPurgeBatchSize(
  batchSize: string | undefined = process.env.AGENT_PURGE_BATCH_SIZE,
): number {
  return resolvePositiveInt(batchSize, DEFAULT_AGENT_PURGE_BATCH_SIZE);
}

export function getAgentPurgeMaxAttempts(
  maxAttempts: string | undefined = process.env.AGENT_PURGE_SWEEP_MAX_ATTEMPTS,
): number {
  return resolvePositiveInt(maxAttempts, DEFAULT_AGENT_PURGE_MAX_ATTEMPTS);
}

export function getAgentPurgeClaimLeaseMs(
  leaseMs: string | undefined = process.env.AGENT_PURGE_CLAIM_LEASE_MS,
): number {
  return resolveSweepIntervalMs(leaseMs, DEFAULT_AGENT_PURGE_CLAIM_LEASE_MS);
}

export function getSkillPurgeSweepInterval(
  interval: string | undefined = process.env.SKILL_PURGE_SWEEP_INTERVAL_MS,
): number {
  return resolveSweepIntervalMs(interval, DEFAULT_SKILL_PURGE_SWEEP_INTERVAL_MS);
}

export function getSkillPurgeBatchSize(
  batchSize: string | undefined = process.env.SKILL_PURGE_BATCH_SIZE,
): number {
  return resolvePositiveInt(batchSize, DEFAULT_SKILL_PURGE_BATCH_SIZE);
}

export function getSkillPurgeMaxAttempts(
  maxAttempts: string | undefined = process.env.SKILL_PURGE_SWEEP_MAX_ATTEMPTS,
): number {
  return resolvePositiveInt(maxAttempts, DEFAULT_SKILL_PURGE_MAX_ATTEMPTS);
}

export function getSkillPurgeClaimLeaseMs(
  leaseMs: string | undefined = process.env.SKILL_PURGE_CLAIM_LEASE_MS,
): number {
  return resolveSweepIntervalMs(leaseMs, DEFAULT_SKILL_PURGE_CLAIM_LEASE_MS);
}

export function getMemoryPurgeSweepInterval(
  interval: string | undefined = process.env.MEMORY_PURGE_SWEEP_INTERVAL_MS,
): number {
  return resolveSweepIntervalMs(interval, DEFAULT_MEMORY_PURGE_SWEEP_INTERVAL_MS);
}

export function getMemoryPurgeBatchSize(
  batchSize: string | undefined = process.env.MEMORY_PURGE_BATCH_SIZE,
): number {
  return resolvePositiveInt(batchSize, DEFAULT_MEMORY_PURGE_BATCH_SIZE);
}

export function getMemoryPurgeMaxAttempts(
  maxAttempts: string | undefined = process.env.MEMORY_PURGE_SWEEP_MAX_ATTEMPTS,
): number {
  return resolvePositiveInt(maxAttempts, DEFAULT_MEMORY_PURGE_MAX_ATTEMPTS);
}

export function getMemoryPurgeClaimLeaseMs(
  leaseMs: string | undefined = process.env.MEMORY_PURGE_CLAIM_LEASE_MS,
): number {
  return resolveSweepIntervalMs(leaseMs, DEFAULT_MEMORY_PURGE_CLAIM_LEASE_MS);
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
      const stillEligible = await deps.confirmConversationPurgeEligible(
        conversation.conversationId,
        conversation.user,
        conversation.purgeClaimId,
        now,
      );
      if (!stillEligible) {
        const retryDelayMs = getConversationPurgeRetryDelay(
          conversation.purgeAttempts,
          maxAttempts,
        );
        await deps.releaseConversationPurgeClaim(conversation.conversationId, {
          success: false,
          retryDelayMs,
          purgeClaimId: conversation.purgeClaimId,
        });
        continue;
      }

      await purgeConversationCascade(
        conversation.user,
        conversation.tenantId,
        [conversation.conversationId],
        deps.cascadeDeps,
      );
      await deps.releaseConversationPurgeClaim(conversation.conversationId, {
        success: true,
        purgeClaimId: conversation.purgeClaimId,
      });
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
          purgeClaimId: conversation.purgeClaimId,
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

/** The minimal shape every generic-sweep candidate needs — the engine itself only
 *  ever reads these three fields; resource-specific fields (author, isPromoted,
 *  source, ...) pass through untouched to `classify`/`cascade`. */
export type ClaimedRetentionResource = {
  resourceId: string;
  purgeClaimId: string;
  purgeAttempts: number;
};

export type GenericPurgeSweepDeps<TCandidate extends ClaimedRetentionResource> = {
  claim: (limit: number, options: { leaseMs: number; now?: Date }) => Promise<TCandidate[]>;
  release: (
    resourceId: string,
    options: { success: boolean; retryDelayMs?: number; purgeClaimId: string },
  ) => Promise<void>;
  /** Returns the subset of the claimed batch's `resourceId`s still private-and-eligible. */
  classify: (candidates: TCandidate[]) => Promise<Set<string>>;
  cascade: (candidate: TCandidate) => Promise<void>;
  logger: SweepLogger;
};

export type GenericPurgeSweepConfig = {
  label: string;
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
  intervalMs: number;
};

/**
 * Model-agnostic claim → classify → cascade engine shared by the agent and skill
 * purge sweeps. Mirrors `purgeExpiredConversations`'s claim-lease/backoff/
 * per-item-isolation shape, with one added branch: a claimed candidate that
 * `classify` excludes (now shared, promoted, or synced) is released with
 * `success: false` and backoff — never deleted, never reclaimed every tick.
 */
export async function sweepGenericRetention<TCandidate extends ClaimedRetentionResource>(
  options: PurgeSweepOptions | undefined,
  deps: GenericPurgeSweepDeps<TCandidate>,
  config: GenericPurgeSweepConfig,
): Promise<PurgeSweepResult> {
  const { limit = config.batchSize, now = new Date() } = options ?? {};
  const claimed = await deps.claim(limit, { leaseMs: config.leaseMs, now });
  if (claimed.length === 0) {
    return { scanned: 0, purged: 0, failed: 0 };
  }

  const eligibleIds = await deps.classify(claimed);
  let purged = 0;
  let failed = 0;

  for (const candidate of claimed) {
    if (!eligibleIds.has(candidate.resourceId)) {
      const retryDelayMs = computePurgeRetryDelay(
        candidate.purgeAttempts,
        config.maxAttempts,
        config.intervalMs,
      );
      try {
        await deps.release(candidate.resourceId, {
          success: false,
          retryDelayMs,
          purgeClaimId: candidate.purgeClaimId,
        });
      } catch (releaseError) {
        deps.logger.error(
          `[${config.label}] Failed to release no-longer-eligible claim for ${candidate.resourceId}:`,
          releaseError,
        );
      }
      continue;
    }

    try {
      await deps.cascade(candidate);
      await deps.release(candidate.resourceId, {
        success: true,
        purgeClaimId: candidate.purgeClaimId,
      });
      purged++;
    } catch (error) {
      failed++;
      deps.logger.error(`[${config.label}] Failed to purge ${candidate.resourceId}:`, error);
      const retryDelayMs = computePurgeRetryDelay(
        candidate.purgeAttempts,
        config.maxAttempts,
        config.intervalMs,
      );
      try {
        await deps.release(candidate.resourceId, {
          success: false,
          retryDelayMs,
          purgeClaimId: candidate.purgeClaimId,
        });
      } catch (releaseError) {
        deps.logger.error(
          `[${config.label}] Failed to release purge claim for ${candidate.resourceId}:`,
          releaseError,
        );
      }
    }
  }

  if (purged > 0 || failed > 0) {
    deps.logger.info(
      `[${config.label}] Processed ${claimed.length} claimed: ${purged} purged, ${failed} failed`,
    );
  }

  return { scanned: claimed.length, purged, failed };
}

export type StartGenericPurgeSweepDeps = {
  sweep: (options?: PurgeSweepOptions) => Promise<PurgeSweepResult>;
  runAsSystem: <T>(fn: () => Promise<T>) => Promise<T>;
  isLeader: () => Promise<boolean>;
  logger: SweepLogger;
};

/** Shared leader-election/reentrancy-guard wiring for the generic resource sweeps. */
export function startGenericPurgeSweep(
  options: PurgeSweepOptions | undefined,
  intervalMs: number,
  label: string,
  { sweep, runAsSystem, isLeader, logger }: StartGenericPurgeSweepDeps,
): NodeJS.Timeout | null {
  if (intervalMs === 0) {
    logger.info(`[${label}] Disabled by sweep interval = 0`);
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
      await runAsSystem(() => sweep(options));
    } catch (error) {
      logger.error(`[${label}] Background sweep failed:`, error);
    } finally {
      isSweeping = false;
    }
  };

  runSweep();
  const interval = setInterval(runSweep, intervalMs);
  interval.unref?.();
  return interval;
}
