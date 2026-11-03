const os = require('os');
const axios = require('axios');
const { Providers } = require('@librechat/agents');
const { CacheKeys } = require('librechat-data-provider');
const { logger, getTenantId } = require('@librechat/data-schemas');
const {
  isLeader,
  generateShortLivedToken,
  createAuthIdentityContext,
  getAppConfigOptionsFromUser,
} = require('@librechat/api');
const {
  createResearchHost,
  createResearchEmail,
  createStrategySnapshotStorage,
} = require('@librechat/researcher');
const { createOpenIDSessionTokenProvider } = require('~/server/services/OpenIDSessionRefresh');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { enqueueAgentTrigger } = require('~/server/services/Agents/triggers');
const { createOboTrustChecker } = require('~/server/services/OboPolicyService');
const { exchangeOboToken } = require('~/server/services/OboTokenService');
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getAppConfig } = require('~/server/services/Config');
const sendEmail = require('~/server/utils/sendEmail');
const { getLogStores } = require('~/cache');
const db = require('~/models');

/** Wiring only: research behaviour lives in `createResearchHost` (@librechat/researcher). */
let host;

const loadAppConfig = (principal) =>
  principal
    ? getAppConfig(getAppConfigOptionsFromUser(principal))
    : getAppConfig({ baseOnly: true });

const storageFunctions = (source) => {
  const fns = getStrategyFunctions(source);
  if (!fns?.saveBuffer || !fns?.getDownloadStream || !fns?.deleteFile) {
    throw new Error(`[research] File strategy "${source}" cannot store research files`);
  }
  return fns;
};

const getStorage = (source) => {
  const fns = storageFunctions(source);
  return createStrategySnapshotStorage({
    source,
    saveBuffer: (input) => fns.saveBuffer(input),
    getDownloadStream: async (filepath) =>
      fns.getDownloadStream({ config: await loadAppConfig() }, filepath),
    deleteFile: async ({ filepath, userId }) =>
      fns.deleteFile(
        { config: await loadAppConfig(), user: { id: userId } },
        { filepath, user: userId, source },
      ),
  });
};

const getReportStorage = (source) => {
  const fns = storageFunctions(source);
  return {
    saveBuffer: async ({ userId, buffer, fileName, tenantId }) => ({
      filepath: await fns.saveBuffer({ userId, buffer, fileName, basePath: 'uploads', tenantId }),
      source,
    }),
  };
};

const createMcpCaller =
  (req) =>
  async ({ serverName, toolName, toolArguments, signal }) => {
    const identityContext = createAuthIdentityContext({ user: req.user, tenantId: getTenantId() });
    const [text] = await getMCPManager().callTool({
      user: req.user,
      serverName,
      toolName,
      provider: Providers.OPENAI,
      toolArguments,
      options: { signal },
      requestBody: req.body,
      flowManager: getFlowStateManager(getLogStores(CacheKeys.FLOWS)),
      tokenMethods: {
        findToken: db.findToken,
        createToken: db.createToken,
        updateToken: db.updateToken,
        deleteTokens: db.deleteTokens,
      },
      graphTokenResolver: getGraphApiToken,
      oboTokenResolver: exchangeOboToken,
      oboTrustChecker: createOboTrustChecker(),
      upstreamTokenProvider: createOpenIDSessionTokenProvider({
        req,
        res: req.res,
        user: req.user,
        identityContext,
        tokenPreference: 'access_token',
      }),
      oboIdentityContext: identityContext,
    });
    return { content: [{ type: 'text', text: typeof text === 'string' ? text : '' }] };
  };

function getResearchHost() {
  host ??= createResearchHost({
    methods: db,
    getAppConfig: loadAppConfig,
    enqueueTrigger: enqueueAgentTrigger,
    getStorage,
    getReportStorage,
    createMcpCaller,
    rag: process.env.RAG_API_URL
      ? { ragApiUrl: process.env.RAG_API_URL, httpClient: axios, generateShortLivedToken }
      : undefined,
    endpointDb: { getUserKey: db.getUserKey, getUserKeyValues: db.getUserKeyValues },
    email: createResearchEmail(sendEmail),
    instanceId: `${os.hostname()}:${process.pid}`,
    isLeader,
  });
  return host;
}

/** Seeds the research agents and starts the worker; returns a stop function. */
async function initializeResearch() {
  const research = getResearchHost();
  await research
    .seed()
    .catch((error) => logger.error('[research] Seeding research agents failed', error));
  return research.start();
}

module.exports = { getResearchHost, initializeResearch };
