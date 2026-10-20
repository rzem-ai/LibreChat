// Deloitte Custom Change: Retention Update
const express = require('express');
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const {
  handleSetAgentRetentionException,
  handleSetSkillRetentionException,
} = require('@librechat/api');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

router.use(requireJwtAuth, requireAdminAccess);

/**
 * Admin-only retention carve-out for a specific agent: the one lever that
 * permanently exempts it from the purge sweep, independent of sharing.
 * @route PATCH /admin/retention/agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @param {{exempt: boolean, reason?: string}} req.body
 */
router.patch('/agents/:id', async (req, res) => {
  try {
    const { status, body } = await handleSetAgentRetentionException(
      req.user?.id,
      req.params.id,
      req.body,
      { setAgentRetentionException: db.setAgentRetentionException },
    );
    return res.status(status).json(body);
  } catch (error) {
    logger.error('[/admin/retention/agents/:id] Failed to set agent retention exception', error);
    return res.status(500).json({ code: 'AGENT_RETENTION_EXCEPTION_FAILED' });
  }
});

/**
 * Admin-only retention carve-out for a specific skill: the one lever that
 * permanently exempts it from the purge sweep, independent of sharing.
 * @route PATCH /admin/retention/skills/:id
 * @param {string} req.params.id - Skill identifier.
 * @param {{exempt: boolean, reason?: string}} req.body
 */
router.patch('/skills/:id', async (req, res) => {
  try {
    const { status, body } = await handleSetSkillRetentionException(
      req.user?.id,
      req.params.id,
      req.body,
      { setSkillRetentionException: db.setSkillRetentionException },
    );
    return res.status(status).json(body);
  } catch (error) {
    logger.error('[/admin/retention/skills/:id] Failed to set skill retention exception', error);
    return res.status(500).json({ code: 'SKILL_RETENTION_EXCEPTION_FAILED' });
  }
});

module.exports = router;
