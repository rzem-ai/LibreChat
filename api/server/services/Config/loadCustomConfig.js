const path = require('path');
const { loadYaml, redactConfigSecretMaps, createCustomConfigLoader } = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
// Deloitte Custom Change: `configSchema` is re-parsed below to recover the zod-validated/resolved
// `mcpServers` value (see `restoreResolvedMcpServers`).
const { configSchema } = require('librechat-data-provider');
const { syncCategories } = require('~/server/utils/agentCategory');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const defaultConfigPath = path.resolve(projectRoot, 'librechat.yaml');

const loadCustomConfigFromSource = createCustomConfigLoader({
  loadLocal: loadYaml,
  defaultConfigPath,
  redactConfig: redactConfigSecretMaps,
});

// Deloitte Custom Change: sync agent marketplace categories with the DB when configured in
// `librechat.yaml`, so deployments can declare their own categories instead of the hardcoded set.
async function syncMarketplaceCategories(customConfig) {
  logger.info('Checking for custom marketplace categories to sync.');
  if (!customConfig.interface?.marketplace?.use) {
    return;
  }
  logger.info('Marketplace is enabled in config.');
  const marketplaceConfig = customConfig.interface.marketplace;
  if (!marketplaceConfig.categories) {
    return;
  }
  logger.info('Marketplace categories configuration found.');
  // enableDefaultCategories should be set as a boolean, defaulting to true if not specified
  const enableDefaultCategories =
    typeof marketplaceConfig.categories.enableDefaultCategories === 'boolean'
      ? marketplaceConfig.categories.enableDefaultCategories
      : true;
  const customCategoriesList = marketplaceConfig.categories.list;
  if (Array.isArray(customCategoriesList)) {
    logger.info(`Found ${customCategoriesList.length} custom categories to sync.`);
  } else {
    logger.info('No custom categories `list` provided; only default-category toggling will run.');
  }
  // Deloitte Custom Change: `runAsSystem` requires an async callback for AsyncLocalStorage
  // context to reliably propagate through the Mongoose operations inside `syncCategories`.
  await runAsSystem(async () => syncCategories(customCategoriesList, enableDefaultCategories));
}

// Deloitte Custom Change: mirrors the `modelSpecs` copy that the upstream loader performs
// internally. Without this, `mcpServers` keeps the raw, untransformed YAML (e.g. unresolved
// `${VAR}` placeholders in MCP server URLs, needed for OBO auth) instead of the
// zod-validated/resolved values. The upstream loader (`@librechat/api`'s
// `createCustomConfigLoader`) doesn't expose its internal parse result, so it's safely
// re-derived here via a second `configSchema` parse of the already-validated config.
function restoreResolvedMcpServers(customConfig) {
  const result = configSchema.strict().safeParse(customConfig);
  if (result.success && result.data.mcpServers) {
    customConfig.mcpServers = result.data.mcpServers;
  }
}

/**
 * Loads custom configuration via the shared `@librechat/api` loader, then layers on
 * Deloitte-specific config-loading behavior (marketplace category sync, resolved MCP server
 * values) before returning it to callers.
 * @function loadCustomConfig
 * @param {boolean} [printConfig=true]
 * @param {{ mode?: 'startup' | 'reload' }} [options]
 * @returns {Promise<TCustomConfig | null>} A promise that resolves to null or the custom config object.
 */
async function loadCustomConfig(printConfig = true, options) {
  const customConfig = await loadCustomConfigFromSource(printConfig, options);
  if (!customConfig) {
    return customConfig;
  }

  restoreResolvedMcpServers(customConfig);
  await syncMarketplaceCategories(customConfig);

  return customConfig;
}

module.exports = loadCustomConfig;
