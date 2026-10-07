const { logger, runAsSystem } = require('@librechat/data-schemas');
const {
  isLeader,
  cascadeDeleteSkill,
  classifyPrivateSkills,
  sweepGenericRetention: sweepGenericRetentionWithDeps,
  startGenericPurgeSweep: startGenericPurgeSweepWithDeps,
  getSkillPurgeSweepInterval,
  getSkillPurgeBatchSize,
  getSkillPurgeMaxAttempts,
  getSkillPurgeClaimLeaseMs,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const db = require('~/models');

const SWEEP_LABEL = 'purgeExpiredSkills';

function createSkillPurgeSweepRequest(candidate, appConfig) {
  return {
    baseUrl: '/api/skills',
    originalUrl: `/api/skills/${candidate.resourceId}`,
    path: `/${candidate.resourceId}`,
    method: 'DELETE',
    headers: {},
    query: {},
    params: { id: candidate.resourceId },
    body: {},
    config: appConfig,
    user: {
      id: candidate.author,
      tenantId: candidate.tenantId,
    },
  };
}

async function cascadeDeleteClaimedSkill(candidate, appConfig) {
  const req = createSkillPurgeSweepRequest(candidate, appConfig);
  await cascadeDeleteSkill(candidate.resourceId, candidate.author, {
    getSkillById: db.getSkillById,
    listSkillFiles: db.listSkillFiles,
    deleteSkillFileBlob: (file) => {
      const { deleteFile } = getStrategyFunctions(file.source);
      return deleteFile(req, {
        filepath: file.filepath,
        storageKey: file.storageKey,
        storageRegion: file.storageRegion,
        user: file.author?.toString?.(),
        tenantId: file.tenantId?.toString?.(),
      });
    },
    deleteSkill: db.deleteSkill,
  });
}

/**
 * Claims private, expired inline skills and cascades each one through
 * `cascadeDeleteSkill`, mirroring `purgeExpiredConversations`'s per-item
 * isolation. A claimed skill that `classifyPrivateSkills` finds no longer
 * eligible (now shared, or no longer `source: 'inline'`) is released with
 * backoff instead of being deleted.
 *
 * @param {object} [options]
 * @param {AppConfig} [options.appConfig]
 * @param {() => Promise<AppConfig>} [options.loadAppConfig]
 * @param {number} [options.limit]
 * @returns {Promise<{ scanned: number, purged: number, failed: number }>}
 */
async function purgeExpiredSkills(options = {}) {
  const { appConfig, loadAppConfig, ...sweepOptions } = options;
  const resolvedAppConfig = (await loadAppConfig?.()) ?? appConfig;

  return sweepGenericRetentionWithDeps(
    sweepOptions,
    {
      claim: db.claimExpiredSkills,
      release: db.releaseSkillPurgeClaim,
      classify: (candidates) =>
        classifyPrivateSkills(candidates, {
          findEntriesByResources: db.findEntriesByResources,
        }),
      cascade: (candidate) => cascadeDeleteClaimedSkill(candidate, resolvedAppConfig),
      logger,
    },
    {
      label: SWEEP_LABEL,
      batchSize: getSkillPurgeBatchSize(),
      leaseMs: getSkillPurgeClaimLeaseMs(),
      maxAttempts: getSkillPurgeMaxAttempts(),
      intervalMs: getSkillPurgeSweepInterval(),
    },
  );
}

function startSkillRetentionSweep(options = {}) {
  return startGenericPurgeSweepWithDeps(options, getSkillPurgeSweepInterval(), SWEEP_LABEL, {
    sweep: purgeExpiredSkills,
    runAsSystem,
    isLeader,
    logger,
  });
}

module.exports = {
  purgeExpiredSkills,
  startSkillRetentionSweep,
};
