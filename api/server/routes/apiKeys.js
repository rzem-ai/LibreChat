const express = require('express');
const { createApiKeyHandlers } = require('@librechat/api');
const {
  getAgentApiKeyById,
  createAgentApiKey,
  deleteAgentApiKey,
  listAgentApiKeys,
  findUser,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const { checkAdmin } = require('~/server/middleware/roles');

const router = express.Router();

const handlers = createApiKeyHandlers({
  createAgentApiKey,
  listAgentApiKeys,
  deleteAgentApiKey,
  getAgentApiKeyById,
  findUser,
});

// Deloitte Custom Change: only administrators can issue or revoke service account API keys.
const requireAdminAccess = checkAdmin;

router.use(requireJwtAuth, requireAdminAccess);

router.post('/', handlers.createApiKey);

router.get('/', handlers.listApiKeys);

router.get('/:id', handlers.getApiKey);

router.delete('/:id', handlers.deleteApiKey);

module.exports = router;
