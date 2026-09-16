const express = require('express');
const { createApiKeyHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  getAgentApiKeyById,
  createAgentApiKey,
  deleteAgentApiKey,
  listAgentApiKeys,
  findUser,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const { requireCapability } = require('~/server/middleware/roles/capabilities');

const router = express.Router();

const handlers = createApiKeyHandlers({
  createAgentApiKey,
  listAgentApiKeys,
  deleteAgentApiKey,
  getAgentApiKeyById,
  findUser,
});

// Deloitte Custom Change: only administrators can issue or revoke service account API keys.
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

router.use(requireJwtAuth, requireAdminAccess);

router.post('/', handlers.createApiKey);

router.get('/', handlers.listApiKeys);

router.get('/:id', handlers.getApiKey);

router.delete('/:id', handlers.deleteApiKey);

module.exports = router;
