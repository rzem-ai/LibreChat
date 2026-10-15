const { logger, runAsSystem } = require('@librechat/data-schemas');
const {
  isLeader,
  deleteClaimedMemory,
  classifyMemoryPurgeEligibility,
  sweepGenericRetention: sweepGenericRetentionWithDeps,
  startGenericPurgeSweep: startGenericPurgeSweepWithDeps,
  getMemoryPurgeSweepInterval,
  getMemoryPurgeBatchSize,
  getMemoryPurgeMaxAttempts,
  getMemoryPurgeClaimLeaseMs,
} = require('@librechat/api');
const db = require('~/models');

const SWEEP_LABEL = 'purgeExpiredMemories';

function purgeClaimedMemory(candidate) {
  return deleteClaimedMemory(
    candidate.resourceId,
    { purgeClaimId: candidate.purgeClaimId, userId: candidate.userId },
    {
      confirmMemoryPurgeEligible: db.confirmMemoryPurgeEligible,
      deleteMemoryById: (memoryId, userId) => db.deleteMemoryById({ userId, id: memoryId }),
    },
  );
}

/**
 * Claims expired memories and deletes each one through `deleteClaimedMemory`,
 * mirroring `purgeExpiredSkills`'s per-item isolation. Memory has no admin
 * exemption lever, so `classifyMemoryPurgeEligibility` is an identity map —
 * every claimed candidate is eligible by construction, and the real
 * re-check happens in `deleteClaimedMemory`'s fence immediately before delete.
 *
 * @param {object} [options]
 * @param {number} [options.limit]
 * @returns {Promise<{ scanned: number, purged: number, failed: number }>}
 */
async function purgeExpiredMemories(options = {}) {
  return sweepGenericRetentionWithDeps(
    options,
    {
      claim: db.claimExpiredMemories,
      release: db.releaseMemoryPurgeClaim,
      classify: classifyMemoryPurgeEligibility,
      cascade: purgeClaimedMemory,
      logger,
    },
    {
      label: SWEEP_LABEL,
      batchSize: getMemoryPurgeBatchSize(),
      leaseMs: getMemoryPurgeClaimLeaseMs(),
      maxAttempts: getMemoryPurgeMaxAttempts(),
      intervalMs: getMemoryPurgeSweepInterval(),
    },
  );
}

function startMemoryRetentionSweep(options = {}) {
  return startGenericPurgeSweepWithDeps(options, getMemoryPurgeSweepInterval(), SWEEP_LABEL, {
    sweep: purgeExpiredMemories,
    runAsSystem,
    isLeader,
    logger,
  });
}

module.exports = {
  purgeExpiredMemories,
  startMemoryRetentionSweep,
};
