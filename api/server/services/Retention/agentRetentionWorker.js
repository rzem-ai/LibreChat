const mongoose = require('mongoose');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const {
  isLeader,
  cascadeDeleteAgent,
  classifyAgentPurgeEligibility,
  getGlobalAgentIds,
  sweepGenericRetention: sweepGenericRetentionWithDeps,
  startGenericPurgeSweep: startGenericPurgeSweepWithDeps,
  getAgentPurgeSweepInterval,
  getAgentPurgeBatchSize,
  getAgentPurgeMaxAttempts,
  getAgentPurgeClaimLeaseMs,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { processDeleteRequest } = require('~/server/services/Files/process');
const db = require('~/models');

const SWEEP_LABEL = 'purgeExpiredAgents';

function createAgentPurgeSweepRequest(candidate, appConfig) {
  return {
    baseUrl: '/api/agents',
    originalUrl: `/api/agents/${candidate.id}`,
    path: `/${candidate.id}`,
    method: 'DELETE',
    headers: {},
    query: {},
    params: { id: candidate.id },
    body: {},
    config: appConfig,
    user: {
      id: candidate.author,
      tenantId: candidate.tenantId,
    },
  };
}

async function cascadeDeleteClaimedAgent(candidate, appConfig) {
  const req = createAgentPurgeSweepRequest(candidate, appConfig);
  await cascadeDeleteAgent(
    candidate.id,
    { tenantId: candidate.tenantId, claimToken: candidate.purgeClaimId },
    {
      getAgent: db.getAgent,
      getFiles: db.getFiles,
      getFileIdsAttachedToLiveConversations: db.getFileIdsAttachedToLiveConversations,
      getSharedResourceFileIds: db.getSharedResourceFileIds,
      removeAgentResourceFiles: db.removeAgentResourceFiles,
      deleteFiles: (files) => processDeleteRequest({ req, files }),
      deleteAvatarBlob: (avatar) => {
        const { deleteFile } = getStrategyFunctions(avatar.source);
        return deleteFile(req, {
          filepath: avatar.filepath,
          user: candidate.author,
          tenantId: candidate.tenantId,
        });
      },
      deleteFileByFilter: db.deleteFileByFilter,
      deleteAgent: db.deleteAgent,
    },
  );
}

/**
 * Claims private, expired agents and cascades each one through `cascadeDeleteAgent`,
 * mirroring `purgeExpiredConversations`'s per-item isolation. A claimed agent that
 * `classifyAgentPurgeEligibility` finds no longer eligible (promoted, or a
 * legacy pre-ACL agent on the admin-maintained global list) is released with
 * backoff instead of being deleted. Sharing an agent never affects its
 * eligibility — only promotion, the legacy global list, and the
 * admin-controlled `retentionException.exempt` do.
 *
 * @param {object} [options]
 * @param {AppConfig} [options.appConfig]
 * @param {() => Promise<AppConfig>} [options.loadAppConfig]
 * @param {number} [options.limit]
 * @returns {Promise<{ scanned: number, purged: number, failed: number }>}
 */
async function purgeExpiredAgents(options = {}) {
  const { appConfig, loadAppConfig, ...sweepOptions } = options;
  const resolvedAppConfig = (await loadAppConfig?.()) ?? appConfig;

  return sweepGenericRetentionWithDeps(
    sweepOptions,
    {
      claim: db.claimExpiredAgents,
      release: db.releaseAgentPurgeClaim,
      classify: (candidates) =>
        classifyAgentPurgeEligibility(
          candidates.map((candidate) => ({ ...candidate, legacyId: candidate.id })),
          {
            findEntriesByResources: db.findEntriesByResources,
            getGlobalAgentIds: () => getGlobalAgentIds(mongoose.connection.db),
          },
        ),
      cascade: (candidate) => cascadeDeleteClaimedAgent(candidate, resolvedAppConfig),
      logger,
    },
    {
      label: SWEEP_LABEL,
      batchSize: getAgentPurgeBatchSize(),
      leaseMs: getAgentPurgeClaimLeaseMs(),
      maxAttempts: getAgentPurgeMaxAttempts(),
      intervalMs: getAgentPurgeSweepInterval(),
    },
  );
}

function startAgentRetentionSweep(options = {}) {
  return startGenericPurgeSweepWithDeps(options, getAgentPurgeSweepInterval(), SWEEP_LABEL, {
    sweep: purgeExpiredAgents,
    runAsSystem,
    isLeader,
    logger,
  });
}

module.exports = {
  purgeExpiredAgents,
  startAgentRetentionSweep,
};
