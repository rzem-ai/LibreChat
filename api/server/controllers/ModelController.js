const { logger } = require('@librechat/data-schemas');
const { createGetModelsConfig, invalidateModelsConfig } = require('@librechat/api');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');

async function loadModels(req) {
  const [defaultModelsConfig, customModelsConfig] = await Promise.all([
    loadDefaultModels(req),
    loadConfigModels(req),
  ]);
  return { ...defaultModelsConfig, ...customModelsConfig };
}

// Deloitte Custom Change: cached (2-min TTL, per tenant/user) so the startup-config,
// `/api/models`, and `/endpoints/token-config` routes hit on the same page load share one
// resolved result instead of each re-running provider discovery and user-key lookups.
const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });

async function modelController(req, res) {
  try {
    const modelConfig = await getModelsConfig(req);
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig, invalidateModelsConfig };
