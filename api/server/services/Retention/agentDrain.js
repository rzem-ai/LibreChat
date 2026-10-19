// Deloitte Custom Change: Retention Update
const { logger } = require('@librechat/data-schemas');
const {
  GenerationJobManager,
  isStopConfirmed,
  waitForGenerationPersistence,
} = require('@librechat/api');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const db = require('~/models');

const POST_DELETE_CANCEL_ATTEMPTS = 3;
const POST_DELETE_CANCEL_BACKOFF_MS = 250;
const GENERATION_LOOKUP_ATTEMPTS = 3;

async function readGenerationForDeletion(conversationId) {
  let lastError;
  for (let attempt = 1; attempt <= GENERATION_LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      return await GenerationJobManager.getCleanupJob(conversationId);
    } catch (error) {
      lastError = error;
      if (attempt < GENERATION_LOOKUP_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
      }
    }
  }
  throw lastError;
}

/** Replays a cancellation plan after deletion, retrying a transiently unreachable
 * owner rather than losing the only pass that can stop a late-admitted child. */
async function retryPostDeleteCancellation(cancellationPlan, deletedConversationIds) {
  for (let attempt = 1; attempt <= POST_DELETE_CANCEL_ATTEMPTS; attempt += 1) {
    try {
      await subagentThreadTaskStore.cancelPlan(cancellationPlan, deletedConversationIds);
      return;
    } catch (error) {
      if (attempt === POST_DELETE_CANCEL_ATTEMPTS) {
        logger.warn('Post-delete subagent cancellation failed', error);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POST_DELETE_CANCEL_BACKOFF_MS * attempt));
    }
  }
}

/** Confirms every exact generation is stopped before its conversation wave is removed. */
async function confirmAgentGenerationsDrained(
  userId,
  conversationIds,
  leaseTaskIds = [],
  tenantId,
  ownerWide = false,
) {
  const drainErrors = [];
  let conversationRunIds;
  try {
    conversationRunIds = ownerWide
      ? await GenerationJobManager.getCleanupBlockingJobIdsForUser(userId, tenantId)
      : await GenerationJobManager.getCleanupBlockingJobIdsForConversations(
          userId,
          conversationIds,
          tenantId,
        );
  } catch (error) {
    logger.warn('Conversation generation index lookup failed', error);
    throw new Error('Conversation generations could not be confirmed drained.');
  }
  const generationIds = [...new Set([...conversationIds, ...leaseTaskIds, ...conversationRunIds])];
  await Promise.all(
    generationIds.map(async (conversationId) => {
      let job;
      try {
        job = await readGenerationForDeletion(conversationId);
      } catch (error) {
        logger.warn('Deleted child generation lookup failed', error);
        drainErrors.push(error);
        return;
      }
      if (job == null || job.metadata?.userId !== userId) {
        return;
      }
      const jobTenantId = job.metadata?.tenantId;
      if (jobTenantId != null && jobTenantId !== tenantId) {
        return;
      }
      const needsDrain =
        job.status === 'running' ||
        job.status === 'requires_action' ||
        job.metadata?.providerDrained === false ||
        job.metadata?.terminalPersistencePending === true ||
        job.metadata?.terminalHostActionPending === true;
      if (!needsDrain) return;
      try {
        const abortResult = await GenerationJobManager.abortJob(conversationId, {
          expectedCreatedAt: job.createdAt,
          awaitProviderDrain: true,
        });
        if (!isStopConfirmed(abortResult)) {
          throw new Error(
            `Could not confirm generation stop for ${conversationId}: ${abortResult?.failureReason ?? 'unknown'}`,
          );
        }
        await waitForGenerationPersistence(conversationId, job.createdAt, (id) =>
          GenerationJobManager.getCleanupJob(id),
        );
      } catch (error) {
        logger.warn('Deleted child generation drain failed', error);
        drainErrors.push(error);
      }
    }),
  );
  if (drainErrors.length > 0) {
    throw new Error('One or more deleted child generations could not be confirmed drained.');
  }
}

/** Repeats generation discovery after the conversation wave is gone, then always
 * removes remnants for that immutable deletion set. A remote run may settle and
 * leave the cleanup index between persisting and this lookup; absence from the
 * index is therefore not evidence that the second persistence sweep is unnecessary. */
async function drainDeletedAgentGenerations(
  userId,
  conversationIds,
  leaseTaskIds = [],
  tenantId,
  deletion,
) {
  await confirmAgentGenerationsDrained(userId, conversationIds, leaseTaskIds, tenantId);
  await db.deleteConvos(
    userId,
    { conversationId: { $in: conversationIds } },
    {
      allowEmpty: true,
      beforeDelete: async (ids) => {
        await deletion?.remember(ids);
        await confirmAgentGenerationsDrained(userId, ids, [], tenantId);
        await deletion?.remember(ids);
      },
    },
  );
  await db.deleteMessages({ user: userId, conversationId: { $in: conversationIds } });
}

module.exports = {
  readGenerationForDeletion,
  retryPostDeleteCancellation,
  confirmAgentGenerationsDrained,
  drainDeletedAgentGenerations,
};
