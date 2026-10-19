// Deloitte Custom Change: Retention Update
const { logger, runAsSystem } = require('@librechat/data-schemas');
const {
  isLeader,
  openCheckpointDeletion,
  deleteConvoSharedLinksWithCleanup,
  purgeExpiredConversations: purgeExpiredConversationsWithDeps,
  startConversationPurgeSweep: startConversationPurgeSweepWithDeps,
} = require('@librechat/api');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  retryPostDeleteCancellation,
  confirmAgentGenerationsDrained,
  drainDeletedAgentGenerations,
} = require('~/server/services/Retention/agentDrain');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const db = require('~/models');

/**
 * Cascades each claimed conversation through the same `purgeConversationCascade` the
 * `DELETE /` route uses, so TTL-expired conversations lose tool calls, shared links,
 * agent generations, and checkpoints exactly as an explicit user delete would.
 *
 * @param {object} [options]
 * @param {AppConfig} [options.appConfig]
 * @param {number} [options.limit]
 * @param {() => Promise<AppConfig>} [options.loadAppConfig]
 * @returns {Promise<{ scanned: number, purged: number, failed: number }>}
 */
async function purgeExpiredConversations(options = {}) {
  const { appConfig, loadAppConfig, ...sweepOptions } = options;
  const resolvedAppConfig = (await loadAppConfig?.()) ?? appConfig;
  const checkpointer = resolvedAppConfig?.endpoints?.[EModelEndpoint.agents]?.checkpointer;

  return purgeExpiredConversationsWithDeps(sweepOptions, {
    claimExpiredConversations: db.claimExpiredConversations,
    releaseConversationPurgeClaim: db.releaseConversationPurgeClaim,
    confirmConversationPurgeEligible: db.confirmConversationPurgeEligible,
    cascadeDeps: {
      checkpointer,
      openCheckpointDeletion,
      deleteConvos: db.deleteConvos,
      deleteToolCalls: db.deleteToolCalls,
      deleteConvoSharedLinksWithCleanup,
      planCancellationForConversations:
        subagentThreadTaskStore.planCancellationForConversations.bind(subagentThreadTaskStore),
      cancelPlan: subagentThreadTaskStore.cancelPlan.bind(subagentThreadTaskStore),
      retryPostDeleteCancellation,
      confirmAgentGenerationsDrained,
      drainDeletedAgentGenerations,
    },
    logger,
  });
}

function startConversationPurgeSweep(options = {}) {
  return startConversationPurgeSweepWithDeps(options, {
    purgeExpiredConversations,
    runAsSystem,
    isLeader,
    logger,
  });
}

module.exports = {
  purgeExpiredConversations,
  startConversationPurgeSweep,
};
