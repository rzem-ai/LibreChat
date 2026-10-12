const mockRegistry = {
  ensureConfigServers: jest.fn(),
  getAllServerConfigs: jest.fn(),
};
const mockUpstreamTokenProvider = jest.fn().mockResolvedValue(null);
const mockCreateOpenIDSessionTokenProvider = jest.fn(() => mockUpstreamTokenProvider);

jest.mock('~/config', () => ({
  getMCPServersRegistry: jest.fn(() => mockRegistry),
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getOAuthReconnectionManager: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(() => 'tenant-1'),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
  setCachedTools: jest.fn(),
  getCachedTools: jest.fn(),
  getMCPServerTools: jest.fn(),
  cacheMCPServerTools: jest.fn(),
  loadCustomConfig: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  /** Pure helpers (normalizeServerName, splitMCPToolKey, schema utils, ...)
   *  stay REAL so key-normalization paths are exercised, not mirrored. */
  ...jest.requireActual('@librechat/api'),
  sendEvent: jest.fn(),
  MCPOAuthHandler: jest.fn(),
  isMCPDomainAllowed: jest.fn(),
  GenerationJobManager: jest.fn(),
  buildOAuthToolCallName: jest.fn((name) => name),
  getUserMCPAuthMap: jest.fn(),
  createAuthIdentityContext: ({ user, tenantId }) => ({
    appUserId: user?._id?.toString?.() ?? user?.id,
    openidSubject: user?.openidId,
    tenantId: tenantId ?? user?.tenantId,
    openidIssuer: user?.openidIssuer,
  }),
  /** Mirrors the real resolver so these tests still exercise the wrapper's own
   *  plumbing - loading the request config and degrading on failure - rather than
   *  the resolution logic, which is unit-tested in packages/api. Like the real
   *  resolver, a lazy-init failure keeps the name lists. */
  resolveMCPServerContext: jest.fn(async ({ mcpConfig, ensureConfigServers }) => {
    const rawServerNames = Object.keys(mcpConfig);
    let configServers = {};
    try {
      configServers = await ensureConfigServers(mcpConfig);
    } catch {
      /* tolerated: name lists derive from the config snapshot alone */
    }
    return { configServers, serverNames: rawServerNames, rawServerNames };
  }),
}));

jest.mock('~/cache', () => ({ getLogStores: jest.fn() }));
jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  findPluginAuthsByKeys: jest.fn(),
  getFiles: jest.fn(),
  getMessages: jest.fn(),
  getCodeGeneratedFiles: jest.fn(),
  findGroupsByMemberId: jest.fn(),
}));
jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: jest.fn(),
}));
jest.mock('~/server/services/OboTokenService', () => ({
  exchangeOboToken: jest.fn(),
}));
jest.mock('~/server/services/OboPolicyService', () => ({
  createOboTrustChecker: jest.fn(() => async () => true),
}));
jest.mock('~/server/services/OpenIDSessionRefresh', () => ({
  createOpenIDSessionTokenProvider: (...args) => mockCreateOpenIDSessionTokenProvider(...args),
}));
jest.mock('~/server/services/Tools/mcp', () => ({
  reinitMCPServer: jest.fn(),
}));
const mockGetStrategyFunctions = jest.fn();
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: (...args) => mockGetStrategyFunctions(...args),
}));
jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

const { Constants } = require('librechat-data-provider');

const {
  getAppConfig,
  getCachedTools,
  getMCPServerTools,
  cacheMCPServerTools,
} = require('~/server/services/Config');
const { reinitMCPServer } = require('~/server/services/Tools/mcp');
const { getUserMCPAuthMap } = require('@librechat/api');
const { getFiles, getMessages, getCodeGeneratedFiles, findGroupsByMemberId } = require('~/models');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const {
  createMCPTool,
  createMCPTools,
  healMcpToolNames,
  getAssistantToolDefinitions,
  resolveConfigServers,
  resolveMcpConfigNames,
  resolveAllMcpConfigs,
  getAccessibleMCPServers,
  resolveMcpServerContext,
  resolveCollisionAuditNames,
  supportsAttachmentUpload,
  resolveAttachmentUpload,
  addAttachmentUploadHints,
} = require('../MCP');

describe('getAssistantToolDefinitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('~/config').getMCPManager.mockReset();
  });

  const req = { user: { id: 'u1', role: 'user' } };
  const serverConfig = { type: 'streamable-http', url: 'https://app.example.com/mcp' };
  const toolKey = `search${Constants.mcp_delimiter}app-server`;
  const mcpDefinition = { type: 'function', function: { name: toolKey } };

  it('combines static definitions with referenced configuration-addressed MCP slices', async () => {
    getCachedTools.mockResolvedValue({ code_interpreter: { type: 'code_interpreter' } });
    getAppConfig.mockResolvedValue({ mcpConfig: {} });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'app-server': serverConfig });
    getMCPServerTools.mockResolvedValue({ [toolKey]: mcpDefinition });

    const definitions = await getAssistantToolDefinitions({
      req,
      tools: ['code_interpreter', toolKey],
    });

    expect(definitions).toEqual({
      toolDefinitions: {
        code_interpreter: { type: 'code_interpreter' },
        [toolKey]: mcpDefinition,
      },
      accessibleServerNames: ['app-server'],
    });
    expect(getMCPServerTools).toHaveBeenCalledWith('u1', 'app-server', serverConfig);
  });

  it('recovers and re-caches a referenced server when its slice is missing', async () => {
    getCachedTools.mockResolvedValue({});
    getAppConfig.mockResolvedValue({ mcpConfig: {} });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'app-server': serverConfig });
    getMCPServerTools.mockResolvedValue(null);
    cacheMCPServerTools.mockResolvedValue(undefined);
    const getServerToolFunctionsSnapshot = jest.fn().mockResolvedValue({
      tools: { [toolKey]: mcpDefinition },
      publicationGeneration: 'connection-generation',
    });
    require('~/config').getMCPManager.mockReturnValue({ getServerToolFunctionsSnapshot });

    await expect(getAssistantToolDefinitions({ req, tools: [toolKey] })).resolves.toEqual({
      toolDefinitions: { [toolKey]: mcpDefinition },
      accessibleServerNames: ['app-server'],
    });
    expect(cacheMCPServerTools).toHaveBeenCalledWith({
      userId: 'u1',
      serverName: 'app-server',
      serverTools: { [toolKey]: mcpDefinition },
      serverConfig,
      publicationGeneration: 'connection-generation',
    });
  });

  it('reinitializes a referenced server when its cache and local snapshot are missing', async () => {
    getCachedTools.mockResolvedValue({});
    getAppConfig.mockResolvedValue({ mcpConfig: {} });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'app-server': serverConfig });
    getMCPServerTools.mockResolvedValue(null);
    const getServerToolFunctionsSnapshot = jest.fn().mockResolvedValue({ tools: null });
    require('~/config').getMCPManager.mockReturnValue({ getServerToolFunctionsSnapshot });
    const userMCPAuthMap = { 'mcp_app-server': { API_KEY: 'saved' } };
    const res = { cookie: jest.fn() };
    getUserMCPAuthMap.mockResolvedValue(userMCPAuthMap);
    reinitMCPServer.mockResolvedValue({ availableTools: { [toolKey]: mcpDefinition } });

    await expect(getAssistantToolDefinitions({ req, res, tools: [toolKey] })).resolves.toEqual({
      toolDefinitions: { [toolKey]: mcpDefinition },
      accessibleServerNames: ['app-server'],
    });
    expect(reinitMCPServer).toHaveBeenCalledWith({
      user: req.user,
      serverName: 'app-server',
      serverConfig,
      userMCPAuthMap,
      upstreamTokenProvider: mockUpstreamTokenProvider,
      oboIdentityContext: {
        appUserId: 'u1',
        openidSubject: undefined,
        tenantId: 'tenant-1',
        openidIssuer: undefined,
      },
    });
    expect(mockCreateOpenIDSessionTokenProvider).toHaveBeenCalledWith({
      req,
      res,
      user: req.user,
      identityContext: {
        appUserId: 'u1',
        openidSubject: undefined,
        tenantId: 'tenant-1',
        openidIssuer: undefined,
      },
      tokenPreference: 'access_token',
    });
    expect(getUserMCPAuthMap).toHaveBeenCalledWith({
      userId: 'u1',
      servers: ['app-server'],
      findPluginAuthsByKeys: expect.any(Function),
    });
  });

  it('propagates config-server resolution failures through the assistant write bridge', async () => {
    const resolutionError = new Error('config resolution failed');
    getCachedTools.mockResolvedValue({});
    getAppConfig.mockResolvedValue({
      mcpConfig: { 'app-server': { type: 'streamable-http', url: 'https://example.com/mcp' } },
    });
    mockRegistry.ensureConfigServers.mockRejectedValue(resolutionError);

    await expect(getAssistantToolDefinitions({ req, tools: [toolKey] })).rejects.toBe(
      resolutionError,
    );
    expect(mockRegistry.getAllServerConfigs).not.toHaveBeenCalled();
    expect(getMCPServerTools).not.toHaveBeenCalled();
  });
});

describe('resolveConfigServers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves config servers for the current request context', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: { url: 'http://a' } } });
    mockRegistry.ensureConfigServers.mockResolvedValue({ srv: { name: 'srv' } });

    const result = await resolveConfigServers({ user: { id: 'u1', role: 'admin' } });

    expect(result).toEqual({ srv: { name: 'srv' } });
    expect(getAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', userId: 'u1' }),
    );
    expect(mockRegistry.ensureConfigServers).toHaveBeenCalledWith({ srv: { url: 'http://a' } });
  });

  it('returns {} when ensureConfigServers throws', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('inspect failed'));

    const result = await resolveConfigServers({ user: { id: 'u1' } });

    expect(result).toEqual({});
  });

  it('returns {} when getAppConfig throws', async () => {
    getAppConfig.mockRejectedValue(new Error('db timeout'));

    const result = await resolveConfigServers({ user: { id: 'u1' } });

    expect(result).toEqual({});
  });

  it('passes empty mcpConfig when appConfig has none', async () => {
    getAppConfig.mockResolvedValue({});
    mockRegistry.ensureConfigServers.mockResolvedValue({});

    await resolveConfigServers({ user: { id: 'u1' } });

    expect(mockRegistry.ensureConfigServers).toHaveBeenCalledWith({});
  });
});

describe('resolveMcpServerContext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('derives config servers and all configured names from a single app-config read', async () => {
    /** `ensureConfigServers` intentionally omits unmodified YAML servers, so the name
     *  list must come from `mcpConfig` itself or boundary resolution goes inert. */
    getAppConfig.mockResolvedValue({ mcpConfig: { unchangedYaml: {}, lazyInit: {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({ lazyInit: { name: 'lazyInit' } });

    const result = await resolveMcpServerContext({ user: { id: 'u1' } });

    expect(result.configServers).toEqual({ lazyInit: { name: 'lazyInit' } });
    expect(result.serverNames.sort()).toEqual(['lazyInit', 'unchangedYaml']);
    expect(getAppConfig).toHaveBeenCalledTimes(1);
  });

  it('degrades to empty rather than rejecting when the config lookup fails', async () => {
    /** A rejection here would abort tool loading entirely, defeating the
     *  catch-and-degrade the sibling resolver already provides. */
    getAppConfig.mockRejectedValue(new Error('db timeout'));

    const result = await resolveMcpServerContext({ user: { id: 'u1' } });

    expect(result).toEqual({ configServers: {}, serverNames: [], rawServerNames: [] });
  });

  it('keeps the name lists when only ensureConfigServers throws', async () => {
    /** The name lists derive from the config snapshot alone; losing them
     *  would leave normalized tool keys unresolvable for the whole request —
     *  a strictly worse degradation than missing overlay configs. */
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('inspect failed'));

    const result = await resolveMcpServerContext({ user: { id: 'u1' } });

    expect(result).toEqual({
      configServers: {},
      serverNames: ['srv'],
      rawServerNames: ['srv'],
    });
  });
});

describe('resolveMcpConfigNames', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves current request config server names', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { cfg_srv: {}, yaml_srv: {} } });

    const result = await resolveMcpConfigNames({ user: { id: 'u1', role: 'admin' } });

    expect(result).toEqual(['cfg_srv', 'yaml_srv']);
    expect(getAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', userId: 'u1' }),
    );
  });

  it('returns [] when mcpConfig is absent', async () => {
    getAppConfig.mockResolvedValue({});

    const result = await resolveMcpConfigNames({ user: { id: 'u1' } });

    expect(result).toEqual([]);
  });

  it('propagates getAppConfig failures for write-path callers', async () => {
    getAppConfig.mockRejectedValue(new Error('db timeout'));

    await expect(resolveMcpConfigNames({ user: { id: 'u1' } })).rejects.toThrow('db timeout');
  });
});

describe('resolveAllMcpConfigs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('merges config servers with base servers', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { cfg_srv: {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({ cfg_srv: { name: 'cfg_srv' } });
    mockRegistry.getAllServerConfigs.mockResolvedValue({
      cfg_srv: { name: 'cfg_srv' },
      yaml_srv: { name: 'yaml_srv' },
    });

    const result = await resolveAllMcpConfigs('u1', { id: 'u1', role: 'user' });

    expect(result).toEqual({
      cfg_srv: { name: 'cfg_srv' },
      yaml_srv: { name: 'yaml_srv' },
    });
    expect(mockRegistry.getAllServerConfigs).toHaveBeenCalledWith(
      'u1',
      {
        cfg_srv: { name: 'cfg_srv' },
      },
      'user',
    );
  });

  it('continues with empty configServers when ensureConfigServers fails', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('inspect failed'));
    mockRegistry.getAllServerConfigs.mockResolvedValue({ yaml_srv: { name: 'yaml_srv' } });

    const result = await resolveAllMcpConfigs('u1', { id: 'u1' });

    expect(result).toEqual({ yaml_srv: { name: 'yaml_srv' } });
    expect(mockRegistry.getAllServerConfigs).toHaveBeenCalledWith('u1', {});
  });

  it('propagates getAllServerConfigs failures', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: {} });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockRejectedValue(new Error('redis down'));

    await expect(resolveAllMcpConfigs('u1', { id: 'u1' })).rejects.toThrow('redis down');
  });

  it('propagates getAppConfig failures', async () => {
    getAppConfig.mockRejectedValue(new Error('mongo down'));

    await expect(resolveAllMcpConfigs('u1', { id: 'u1' })).rejects.toThrow('mongo down');
  });

  it('keeps protected servers for members of the configured Entra group', async () => {
    getAppConfig.mockResolvedValue({
      mcpConfig: {
        sharepoint: {
          allowedEntraGroupIds: ['00c0efc7-e8a7-448c-9480-834cbf1ebd60'],
        },
      },
    });
    findGroupsByMemberId.mockResolvedValue([
      { source: 'entra', idOnTheSource: '00c0efc7-e8a7-448c-9480-834cbf1ebd60' },
    ]);
    mockRegistry.ensureConfigServers.mockResolvedValue({ sharepoint: { name: 'sharepoint' } });
    mockRegistry.getAllServerConfigs.mockResolvedValue({ sharepoint: { name: 'sharepoint' } });

    const result = await resolveAllMcpConfigs('u1', { id: 'u1', role: 'user' });

    expect(findGroupsByMemberId).toHaveBeenCalledWith('u1');
    expect(mockRegistry.ensureConfigServers).toHaveBeenCalledWith({
      sharepoint: { allowedEntraGroupIds: ['00c0efc7-e8a7-448c-9480-834cbf1ebd60'] },
    });
    expect(result).toEqual({ sharepoint: { name: 'sharepoint' } });
  });

  it('hides protected servers from users outside the configured Entra group', async () => {
    getAppConfig.mockResolvedValue({
      mcpConfig: {
        sharepoint: {
          allowedEntraGroupIds: ['00c0efc7-e8a7-448c-9480-834cbf1ebd60'],
        },
      },
    });
    findGroupsByMemberId.mockResolvedValue([{ source: 'entra', idOnTheSource: 'different-group' }]);
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    // The registry re-merges YAML servers after config overrides. The final access filter must
    // still remove SharePoint for a non-member.
    mockRegistry.getAllServerConfigs.mockResolvedValue({
      sharepoint: { allowedEntraGroupIds: ['00c0efc7-e8a7-448c-9480-834cbf1ebd60'] },
    });

    await expect(resolveAllMcpConfigs('u1', { id: 'u1' })).resolves.toEqual({});

    expect(mockRegistry.ensureConfigServers).toHaveBeenCalledWith({});
  });

  it('passes the user ID when resolving accessible protected servers', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: {} });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({});

    await getAccessibleMCPServers('u1', 'user');

    expect(getAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', role: 'user' }),
    );
  });
});

describe('createMCPTools group access', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not construct tools for a user outside the required Entra group', async () => {
    findGroupsByMemberId.mockResolvedValue([]);

    const result = await createMCPTools({
      user: { id: 'u1' },
      serverName: 'cleartrack-mcp-gateway-sharepoint',
      config: {
        type: 'streamable-http',
        url: 'https://sharepoint.example.com/mcp',
        allowedEntraGroupIds: ['00c0efc7-e8a7-448c-9480-834cbf1ebd60'],
      },
    });

    expect(result).toEqual([]);
    expect(findGroupsByMemberId).toHaveBeenCalledWith('u1');
  });
});

describe('healMcpToolNames', () => {
  beforeEach(() => jest.clearAllMocks());

  const req = { user: { id: 'u1', role: 'user' } };

  it('heals a legacy raw-keyed assistant tool to the normalized cache key', async () => {
    /** Assistant docs saved pre-normalization resubmit the raw-suffixed
     *  string on every edit; the controllers' exact lookup would silently
     *  drop the tool. */
    getAppConfig.mockResolvedValue({ mcpConfig: { 'Connector: Company': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'Connector: Company': {} });
    const canonicalKey = `search${Constants.mcp_delimiter}Connector__Company`;
    const toolDefinitions = { [canonicalKey]: { type: 'function' } };

    const healed = await healMcpToolNames({
      req,
      tools: [`search${Constants.mcp_delimiter}Connector: Company`, 'code_interpreter'],
      toolDefinitions,
    });

    expect(healed).toEqual([canonicalKey, 'code_interpreter']);
  });

  it('leaves a SHADOWED raw name untouched (fail closed like the runtime heal)', async () => {
    /** With `foo` and `foo!` both configured, rewriting `search_mcp_foo!`
     *  would land on the WINNER server's key. */
    getAppConfig.mockResolvedValue({ mcpConfig: { foo: {}, 'foo!': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ foo: {}, 'foo!': {} });
    const toolDefinitions = { [`search${Constants.mcp_delimiter}foo`]: { type: 'function' } };

    const healed = await healMcpToolNames({
      req,
      tools: [`search${Constants.mcp_delimiter}foo!`],
      toolDefinitions,
    });

    expect(healed).toEqual([`search${Constants.mcp_delimiter}foo!`]);
  });

  it('heals a pre-strip prefixed key to the stripped catalog key', async () => {
    /** Catalog keys drop a redundant leading server-name prefix now; an
     *  assistant saved before that resubmits the prefixed key and the exact
     *  lookup would silently drop the tool. */
    getAppConfig.mockResolvedValue({ mcpConfig: { acme: {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ acme: {} });
    const strippedKey = `search${Constants.mcp_delimiter}acme`;
    const toolDefinitions = {
      [strippedKey]: { type: 'function', serverToolName: 'acme_search' },
    };

    const healed = await healMcpToolNames({
      req,
      tools: [`acme_search${Constants.mcp_delimiter}acme`],
      toolDefinitions,
    });

    expect(healed).toEqual([strippedKey]);
  });

  it('heals a pre-strip key whose server suffix is already normalized', async () => {
    /** Keys persisted after server-name normalization carry the NORMALIZED
     *  suffix, which the raw config names cannot match — the strip heal must
     *  resolve the boundary against both spellings. */
    getAppConfig.mockResolvedValue({ mcpConfig: { 'My Server': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'My Server': {} });
    const strippedKey = `search${Constants.mcp_delimiter}My_Server`;
    const toolDefinitions = {
      [strippedKey]: { type: 'function', serverToolName: 'my_server_search' },
    };

    const healed = await healMcpToolNames({
      req,
      tools: [`my_server_search${Constants.mcp_delimiter}My_Server`],
      toolDefinitions,
    });

    expect(healed).toEqual([strippedKey]);
  });

  it('reuses a provided accessible-server snapshot without re-reading config', async () => {
    /** The controllers pass the definitions loader's snapshot so the write
     *  path does not repeat the app-config and registry round trips. */
    const strippedKey = `search${Constants.mcp_delimiter}acme`;
    const toolDefinitions = {
      [strippedKey]: { type: 'function', serverToolName: 'acme_search' },
    };

    const healed = await healMcpToolNames({
      req,
      tools: [`acme_search${Constants.mcp_delimiter}acme`],
      toolDefinitions,
      accessibleServerNames: ['acme'],
    });

    expect(healed).toEqual([strippedKey]);
    expect(getAppConfig).not.toHaveBeenCalled();
    expect(mockRegistry.getAllServerConfigs).not.toHaveBeenCalled();
  });

  it('heals a pre-strip key for a USER-OWNED server absent from the operator config', async () => {
    /** Assistants reference user DB servers too — the definitions loader
     *  resolves them, so the heal's audit must include them or the legacy
     *  key stays unhealed and the controllers drop the tool on edit. */
    getAppConfig.mockResolvedValue({ mcpConfig: {} });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ acme: {} });
    const strippedKey = `search${Constants.mcp_delimiter}acme`;
    const toolDefinitions = {
      [strippedKey]: { type: 'function', serverToolName: 'acme_search' },
    };

    const healed = await healMcpToolNames({
      req,
      tools: [`acme_search${Constants.mcp_delimiter}acme`],
      toolDefinitions,
    });

    expect(healed).toEqual([strippedKey]);
  });

  it('does not heal a stale key onto a sibling that lacks matching upstream identity', async () => {
    /** With `acme_acme_foo` removed upstream while `acme_foo` kept its raw
     *  name, the stale key's stripped spelling exists but belongs to a
     *  DIFFERENT tool — the identity check must reject the rewrite. */
    getAppConfig.mockResolvedValue({ mcpConfig: { acme: {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ acme: {} });
    const staleKey = `acme_acme_foo${Constants.mcp_delimiter}acme`;
    const toolDefinitions = {
      [`acme_foo${Constants.mcp_delimiter}acme`]: { type: 'function' },
      [`foo${Constants.mcp_delimiter}acme`]: { type: 'function', serverToolName: 'acme_foo' },
    };

    const healed = await healMcpToolNames({ req, tools: [staleKey], toolDefinitions });

    expect(healed).toEqual([staleKey]);
  });

  it('fails closed on a normalized-suffix key whose slot is CONTESTED', async () => {
    /** `My Server` and `My_Server!` both normalize to `My_Server`, so a
     *  normalized-suffix reference is ambiguous between them — rewriting
     *  persisted data must not bind it to the tie-break winner. */
    getAppConfig.mockResolvedValue({ mcpConfig: { 'My Server': {}, 'My_Server!': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'My Server': {}, 'My_Server!': {} });
    const legacyKey = `my_server_search${Constants.mcp_delimiter}My_Server`;
    const toolDefinitions = { [`search${Constants.mcp_delimiter}My_Server`]: { type: 'function' } };

    const healed = await healMcpToolNames({ req, tools: [legacyKey], toolDefinitions });

    expect(healed).toEqual([legacyKey]);
  });

  it('keeps a prefixed key whose stripped spelling is not in the loaded definitions', async () => {
    /** When the catalog kept the raw name (bare-sibling collision), the
     *  prefixed key IS canonical and must not be rewritten into a key owned
     *  by the bare tool. */
    getAppConfig.mockResolvedValue({ mcpConfig: { acme: {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ acme: {} });
    const prefixedKey = `acme_search${Constants.mcp_delimiter}acme`;
    const toolDefinitions = {
      [prefixedKey]: { type: 'function' },
      [`search${Constants.mcp_delimiter}acme`]: { type: 'function' },
    };

    const healed = await healMcpToolNames({ req, tools: [prefixedKey], toolDefinitions });

    expect(healed).toEqual([prefixedKey]);
  });

  it('skips the config read entirely when every delimiter-bearing name resolves', async () => {
    const key = `search${Constants.mcp_delimiter}srv`;
    const healed = await healMcpToolNames({
      req,
      tools: [key, 'web_search'],
      toolDefinitions: { [key]: { type: 'function' } },
    });

    expect(healed).toEqual([key, 'web_search']);
    expect(getAppConfig).not.toHaveBeenCalled();
  });

  it('fails closed on a CROSS-TIER shadow (user-DB server owns the normalized slot)', async () => {
    /** Operator config alone shows `foo!` unshadowed, but a user-DB server
     *  named `foo` owns the normalized slot — rewriting would bind the
     *  saved assistant to the DB server's tool at execution. */
    getAppConfig.mockResolvedValue({ mcpConfig: { 'foo!': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({
      foo: { name: 'foo' },
      'foo!': { name: 'foo!' },
    });
    const toolDefinitions = { [`search${Constants.mcp_delimiter}foo`]: { type: 'function' } };

    const healed = await healMcpToolNames({
      req,
      tools: [`search${Constants.mcp_delimiter}foo!`],
      toolDefinitions,
    });

    expect(healed).toEqual([`search${Constants.mcp_delimiter}foo!`]);
  });

  it('skips healing entirely when the collision audit cannot complete', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { 'Connector: Company': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockRejectedValue(new Error('redis down'));
    const canonicalKey = `search${Constants.mcp_delimiter}Connector__Company`;

    const healed = await healMcpToolNames({
      req,
      tools: [`search${Constants.mcp_delimiter}Connector: Company`],
      toolDefinitions: { [canonicalKey]: { type: 'function' } },
    });

    expect(healed).toEqual([`search${Constants.mcp_delimiter}Connector: Company`]);
  });

  it('dedupes when the payload carries both spellings of the same tool', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { 'Connector: Company': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'Connector: Company': {} });
    const canonicalKey = `search${Constants.mcp_delimiter}Connector__Company`;
    const toolDefinitions = { [canonicalKey]: { type: 'function' } };

    const healed = await healMcpToolNames({
      req,
      tools: [
        `search${Constants.mcp_delimiter}Connector: Company`,
        canonicalKey,
        'code_interpreter',
      ],
      toolDefinitions,
    });

    expect(healed).toEqual([canonicalKey, 'code_interpreter']);
  });
});

describe('resolveCollisionAuditNames', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores config names the tolerant merged read silently dropped', async () => {
    /** `resolveAllMcpConfigs` swallows `ensureConfigServers` failures, so a
     *  transient init error can omit a config-only server from the merged
     *  map — the audit would then miss the `foo` / `foo!` collision while
     *  still claiming completeness. The snapshot-derived raw names must be
     *  unioned back in. */
    getAppConfig.mockResolvedValue({ mcpConfig: { 'foo!': {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('init failed'));
    mockRegistry.getAllServerConfigs.mockResolvedValue({ foo: { name: 'foo' } });

    const audit = await resolveCollisionAuditNames({
      rawServerNames: ['foo!'],
      userId: 'u1',
      role: 'user',
    });

    expect(audit.complete).toBe(true);
    expect([...audit.names].sort()).toEqual(['foo', 'foo!']);
  });

  it('reports incomplete when the merged read itself fails', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { 'foo!': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockRejectedValue(new Error('redis down'));

    const audit = await resolveCollisionAuditNames({
      rawServerNames: ['foo!'],
      userId: 'u1',
      role: 'user',
    });

    expect(audit.complete).toBe(false);
    expect(audit.names).toEqual(['foo!']);
  });
});

describe('createMCPTool', () => {
  beforeEach(() => jest.clearAllMocks());

  const rawServerName = 'Connector: Company';
  const legacyToolKey = `search${Constants.mcp_delimiter}${rawServerName}`;
  const canonicalToolKey = `search${Constants.mcp_delimiter}Connector__Company`;
  const toolFunction = {
    name: canonicalToolKey,
    description: 'Search the company connector',
    parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  };

  it('resolves a legacy raw-spelled key against the normalized availableTools index', async () => {
    /** Assistants and direct tool calls persisted pre-normalization bypass
     *  the agent-boundary heal and arrive with RAW keys; `availableTools`
     *  is keyed canonically, so the lookup must cover both spellings
     *  instead of stubbing the tool as unavailable. */
    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: legacyToolKey,
      serverName: rawServerName,
      availableTools: { [canonicalToolKey]: { type: 'function', function: toolFunction } },
      config: { type: 'stdio', command: 'node' },
      provider: 'openAI',
    });

    expect(toolInstance).toBeDefined();
    expect(toolInstance.name).toBe(canonicalToolKey);
    expect(toolInstance.description).toBe(toolFunction.description);
    expect(reinitMCPServer).not.toHaveBeenCalled();
  });

  it('parses a legacy key whose raw server name contains the delimiter', async () => {
    /** A raw name like `foo_mcp_bar!` defeats the generic last-delimiter
     *  split (`toolName` would become `search_mcp_foo`), so the boundary
     *  candidates must include the RAW resolved name — not only its
     *  normalized form — for the canonical rebuild to hit the index. */
    const delimiterRawName = 'foo_mcp_bar!';
    const legacyKey = `search${Constants.mcp_delimiter}${delimiterRawName}`;
    /** `normalizeServerName` strips the trailing underscore the `!` leaves. */
    const canonicalKey = `search${Constants.mcp_delimiter}foo_mcp_bar`;
    const delimiterToolFunction = {
      name: canonicalKey,
      description: 'Search the delimiter-named server',
      parameters: { type: 'object', properties: {} },
    };

    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: legacyKey,
      serverName: delimiterRawName,
      availableTools: { [canonicalKey]: { type: 'function', function: delimiterToolFunction } },
      config: { type: 'stdio', command: 'node' },
      provider: 'openAI',
    });

    expect(toolInstance).toBeDefined();
    expect(toolInstance.name).toBe(canonicalKey);
    expect(reinitMCPServer).not.toHaveBeenCalled();
  });

  it('still resolves the canonical key directly', async () => {
    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: canonicalToolKey,
      serverName: rawServerName,
      availableTools: { [canonicalToolKey]: { type: 'function', function: toolFunction } },
      config: { type: 'stdio', command: 'node' },
      provider: 'openAI',
    });

    expect(toolInstance).toBeDefined();
    expect(toolInstance.name).toBe(canonicalToolKey);
    expect(reinitMCPServer).not.toHaveBeenCalled();
  });

  it('forwards the configured recovery policy when a missing tool reconnects', async () => {
    const recoveryPolicy = {
      authorizationFenceRetryMs: [0, 25, 100],
      authorizationFenceTimeoutMs: 750,
    };
    getAppConfig.mockResolvedValue({ mcpSettings: { catalogRecovery: recoveryPolicy } });
    require('@librechat/api').isMCPDomainAllowed.mockResolvedValue(true);
    require('~/config').getFlowStateManager.mockReturnValue({});
    require('~/cache').getLogStores.mockReturnValue({});
    reinitMCPServer.mockResolvedValue({
      availableTools: { [canonicalToolKey]: { type: 'function', function: toolFunction } },
    });

    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: canonicalToolKey,
      serverName: rawServerName,
      availableTools: {},
      config: { type: 'streamable-http', url: 'https://mcp.example.com' },
      provider: 'openAI',
    });

    expect(toolInstance).toBeDefined();
    expect(reinitMCPServer).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: rawServerName, recoveryPolicy }),
    );
  });

  it('uses a reference-only schema for configured attachment uploads', async () => {
    const uploadKey = `upload${Constants.mcp_delimiter}files`;
    const uploadDefinition = {
      name: uploadKey,
      description: 'Upload a file',
      parameters: {
        type: 'object',
        properties: { fileName: { type: 'string' }, content: { type: 'string' } },
        required: ['fileName', 'content'],
        oneOf: [{ required: ['fileName'] }],
      },
    };
    getAppConfig.mockResolvedValue({
      mcpConfig: { files: { attachmentUploadTools: ['upload'] } },
    });

    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: uploadKey,
      serverName: 'files',
      availableTools: { [uploadKey]: { type: 'function', function: uploadDefinition } },
      config: { type: 'stdio', command: 'node', attachmentUploadTools: ['upload'] },
      provider: 'openAI',
      requestBody: { conversationId: 'conversation-1' },
    });

    expect(toolInstance.name).toBe(uploadKey);
    expect(toolInstance.mcpJsonSchema.properties.content).toBeUndefined();
    expect(toolInstance.mcpJsonSchema.properties.sourceFileName).toBeDefined();
    expect(toolInstance.mcpJsonSchema.oneOf).toEqual([{ required: ['fileName'] }]);
    // Strict function-calling providers (e.g. OpenAI) reject oneOf/anyOf/allOf
    // at the schema root, so the upload tools must not add one here.
    expect(toolInstance.mcpJsonSchema.allOf).toBeUndefined();
    expect(toolInstance.description).toContain('Upload a file');
  });

  it('instructs the model to use an attachment ID when a file is attached', async () => {
    const uploadKey = `upload${Constants.mcp_delimiter}files`;
    const uploadDefinition = {
      name: uploadKey,
      description: 'Upload a file',
      parameters: {
        type: 'object',
        properties: { fileName: { type: 'string' }, content: { type: 'string' } },
        required: ['fileName', 'content'],
      },
    };
    getAppConfig.mockResolvedValue({
      mcpConfig: { files: { attachmentUploadTools: ['upload'] } },
    });

    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: uploadKey,
      serverName: 'files',
      availableTools: { [uploadKey]: { type: 'function', function: uploadDefinition } },
      config: { type: 'stdio', command: 'node', attachmentUploadTools: ['upload'] },
      provider: 'openAI',
      requestBody: { files: [{ file_id: 'file-1', filename: 'presentation.pptx' }] },
    });

    expect(toolInstance.mcpJsonSchema.properties.sourceFileId).toBeDefined();
    expect(toolInstance.description).toContain('sourceFileId');
    expect(toolInstance.description).not.toContain('sourceFileName');
    expect(toolInstance.description).not.toContain('base64');
  });
});

// Deloitte Custom Change: attachment uploads are resolved from authorized request files.
describe('resolveAttachmentUpload', () => {
  beforeEach(() => jest.clearAllMocks());

  it('replaces sourceFileId with the authorized attachment bytes', async () => {
    const { Readable } = require('stream');
    const stream = Readable.from([Buffer.from('p'), Buffer.from('ptx bytes')]);
    const getDownloadStream = jest.fn().mockResolvedValue({ data: stream });
    const req = { user: { id: 'user-1' } };
    const attachment = {
      file_id: 'file-1',
      source: 'azure_blob',
      filepath: '/attachments/file-1',
    };
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getFiles.mockResolvedValue([attachment]);

    const result = await resolveAttachmentUpload({
      toolArguments: { sourceFileId: 'file-1', fileName: 'presentation.pptx' },
      requestBody: { files: [attachment] },
      req,
      user: { id: 'user-1' },
    });

    expect(result).toEqual({
      fileName: 'presentation.pptx',
      content: Buffer.from('pptx bytes').toString('base64'),
      encoding: 'base64',
    });
    expect(mockGetStrategyFunctions).toHaveBeenCalledWith('azure_blob');
    expect(getDownloadStream).toHaveBeenCalledWith(req, attachment.filepath);
  });

  it('resolves a generated file by the current conversation and user', async () => {
    const { Readable } = require('stream');
    const getCodeStream = jest.fn().mockResolvedValue({
      data: Readable.from([Buffer.from('pptx bytes')]),
    });
    mockGetStrategyFunctions.mockImplementation((source) =>
      source === 'execute_code' ? { getDownloadStream: getCodeStream } : {},
    );
    getFiles.mockResolvedValue([
      {
        file_id: 'file-1',
        filename: 'testsp7.pptx',
        source: 'azure_blob',
        filepath: '/uploads/file-1',
        context: 'execute_code',
        metadata: {
          codeEnvRef: {
            storage_session_id: 'storage-session-1',
            file_id: 'code-file-1',
            kind: 'skill',
            id: 'skill-1',
            version: 2,
          },
        },
      },
    ]);
    getMessages.mockResolvedValue([
      {
        messageId: 'parent-1',
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        files: [{ file_id: 'file-1' }],
      },
    ]);
    getCodeGeneratedFiles.mockResolvedValue([
      {
        file_id: 'file-1',
        filename: 'testsp7.pptx',
        source: 'azure_blob',
        filepath: '/uploads/file-1',
        context: 'execute_code',
        metadata: {
          codeEnvRef: {
            storage_session_id: 'storage-session-1',
            file_id: 'code-file-1',
            kind: 'skill',
            id: 'skill-1',
            version: 2,
          },
        },
      },
    ]);

    const result = await resolveAttachmentUpload({
      toolArguments: { sourceFileName: 'testsp7.pptx' },
      requestBody: { conversationId: 'conversation-1', parentMessageId: 'parent-1' },
      req: {},
      user: { id: 'user-1' },
    });

    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', user: 'user-1' },
      'messageId parentMessageId files attachments',
    );
    expect(getCodeGeneratedFiles).toHaveBeenCalledWith('conversation-1', ['file-1'], {
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
    expect(result).toEqual({
      content: Buffer.from('pptx bytes').toString('base64'),
      encoding: 'base64',
    });
    expect(mockGetStrategyFunctions).toHaveBeenCalledWith('execute_code');
    expect(getCodeStream).toHaveBeenCalledWith(
      'storage-session-1/code-file-1',
      { kind: 'skill', id: 'skill-1', version: 2 },
      expect.any(Object),
    );
  });

  it('resolves a file generated earlier in the same still-in-progress turn', async () => {
    const { Readable } = require('stream');
    const getCodeStream = jest.fn().mockResolvedValue({
      data: Readable.from([Buffer.from('pptx bytes')]),
    });
    mockGetStrategyFunctions.mockImplementation((source) =>
      source === 'execute_code' ? { getDownloadStream: getCodeStream } : {},
    );
    // No saved message references this file yet, so the thread-scoped lookup is empty.
    getMessages.mockResolvedValue([]);
    getCodeGeneratedFiles.mockResolvedValue([]);
    // The file record itself already exists, tagged with the in-flight response message id.
    getFiles.mockResolvedValue([
      {
        file_id: 'file-2',
        filename: 'retail-outlook.pptx',
        source: 'azure_blob',
        filepath: '/uploads/file-2',
        context: 'execute_code',
        messageId: 'response-1',
        metadata: {
          codeEnvRef: {
            storage_session_id: 'storage-session-2',
            file_id: 'code-file-2',
            kind: 'skill',
            id: 'skill-2',
            version: 1,
          },
        },
      },
    ]);

    const result = await resolveAttachmentUpload({
      toolArguments: { sourceFileName: 'retail-outlook.pptx' },
      requestBody: {
        conversationId: 'conversation-1',
        parentMessageId: 'parent-1',
        messageId: 'response-1',
      },
      req: {},
      user: { id: 'user-1' },
    });

    expect(getFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        user: 'user-1',
        context: 'execute_code',
        messageId: 'response-1',
      }),
      null,
      { text: 0 },
    );
    expect(result).toEqual({
      content: Buffer.from('pptx bytes').toString('base64'),
      encoding: 'base64',
    });
  });

  it('rejects a missing source reference', async () => {
    await expect(
      resolveAttachmentUpload({ toolArguments: { fileName: 'presentation.pptx' } }),
    ).rejects.toThrow('Specify exactly one attachment source reference');
  });

  it('rejects a sourceFileId that is not attached to the current request', async () => {
    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileId: 'other-user-file' },
        requestBody: { files: [{ file_id: 'file-1' }] },
      }),
    ).rejects.toThrow('Attachment source must identify a file available to the current user');
  });

  it('rejects an empty sourceFileId instead of forwarding an incomplete upload', async () => {
    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileId: '' },
        requestBody: { files: [] },
      }),
    ).rejects.toThrow('sourceFileId must be a non-empty string');
  });

  it('accepts storage strategies that return a stream directly', async () => {
    const { Readable } = require('stream');
    const stream = Readable.from([Buffer.from('pptx bytes')]);
    mockGetStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(stream),
    });
    getFiles.mockResolvedValue([{ file_id: 'file-1', source: 'azure_blob', filepath: '/file-1' }]);

    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileId: 'file-1' },
        requestBody: { files: [{ file_id: 'file-1', source: 'azure_blob', filepath: '/file-1' }] },
      }),
    ).resolves.toMatchObject({ content: Buffer.from('pptx bytes').toString('base64') });
  });

  it('falls back to durable storage when a generated file has no code environment reference', async () => {
    const { Readable } = require('stream');
    const getDownloadStream = jest
      .fn()
      .mockResolvedValue({ data: Readable.from([Buffer.from('saved')]) });
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getMessages.mockResolvedValue([
      {
        messageId: 'parent-1',
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        files: [{ file_id: 'file-1' }],
      },
    ]);
    getCodeGeneratedFiles.mockResolvedValue([
      {
        file_id: 'file-1',
        filename: 'saved.csv',
        source: 'azure_blob',
        filepath: '/uploads/file-1',
        context: 'execute_code',
      },
    ]);

    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileName: 'saved.csv' },
        requestBody: { conversationId: 'conversation-1', parentMessageId: 'parent-1' },
        req: { user: { id: 'user-1' } },
        user: { id: 'user-1' },
      }),
    ).resolves.toMatchObject({ content: Buffer.from('saved').toString('base64') });
    expect(getDownloadStream).toHaveBeenCalledWith(expect.any(Object), '/uploads/file-1');
  });

  it('uses an endpoint-specific client for OpenAI-backed files', async () => {
    const { Readable } = require('stream');
    const openai = {};
    const getDownloadStream = jest
      .fn()
      .mockResolvedValue({ body: Readable.from([Buffer.from('pptx bytes')]) });
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getOpenAIClient.mockResolvedValue({ openai });
    getFiles.mockResolvedValue([
      { file_id: 'file-1', source: 'openai', model: 'gpt-4o', filepath: '/unused' },
    ]);

    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileId: 'file-1' },
        requestBody: { files: [{ file_id: 'file-1' }] },
        req: { body: {} },
        res: {},
        user: { id: 'user-1' },
      }),
    ).resolves.toMatchObject({ content: Buffer.from('pptx bytes').toString('base64') });
    expect(getDownloadStream).toHaveBeenCalledWith('file-1', openai);
  });
});

// Deloitte Custom Change: only configured MCP tools receive attachment identifiers.
describe('addAttachmentUploadHints', () => {
  it('lists current-request attachments for an explicitly configured upload tool', () => {
    const schema = {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Base64-encoded content.' },
        encoding: { type: 'string', description: 'Content encoding.' },
      },
      required: ['driveId', 'content', 'encoding'],
    };

    const result = addAttachmentUploadHints(
      schema,
      'sp_upload_file',
      { attachmentUploadTools: ['sp_upload_file'] },
      { files: [{ file_id: 'file-1', filename: 'presentation.pptx' }] },
    );

    expect(result.properties.sourceFileId.description).toContain('file-1 (presentation.pptx)');
    expect(result.properties.content).toBeUndefined();
    expect(result.properties.encoding).toBeUndefined();
    expect(result.required).toEqual(['driveId']);
    expect(schema.properties.sourceFileId).toBeUndefined();
    expect(schema.required).toEqual(['driveId', 'content', 'encoding']);
  });

  it('does not expose attachment IDs to an unconfigured tool', () => {
    const schema = { properties: { content: { description: 'Base64-encoded content.' } } };

    expect(
      addAttachmentUploadHints(
        schema,
        'sp_upload_file',
        {},
        { files: [{ file_id: 'file-1', filename: 'presentation.pptx' }] },
      ),
    ).toBe(schema);
  });

  it('requires a generated conversation file name when no request attachment exists', () => {
    const result = addAttachmentUploadHints(
      {
        properties: { content: { type: 'string' } },
        required: ['content'],
      },
      'sp_upload_file',
      { attachmentUploadTools: ['sp_upload_file'] },
      { conversationId: 'conversation-1' },
    );

    expect(result.properties.content).toBeUndefined();
    expect(result.properties.sourceFileName).toBeDefined();
    expect(result.required).toEqual([]);
  });

  it('requires a provider-compatible source reference for Google schemas', () => {
    const schema = { properties: { content: { type: 'string' } }, required: ['content'] };

    expect(
      addAttachmentUploadHints(
        schema,
        'sp_upload_file',
        { attachmentUploadTools: ['sp_upload_file'] },
        { files: [{ file_id: 'file-1' }] },
        true,
      ).required,
    ).toEqual(['sourceFile']);
    expect(
      addAttachmentUploadHints(
        schema,
        'sp_upload_file',
        { attachmentUploadTools: ['sp_upload_file'] },
        { conversationId: 'conversation-1' },
        true,
      ).required,
    ).toEqual(['sourceFile']);
  });
});

// Deloitte Custom Change: only explicitly trusted MCP tools may receive attachment bytes.
describe('supportsAttachmentUpload', () => {
  it('requires an explicit server configuration allowlist entry', () => {
    expect(
      supportsAttachmentUpload({ attachmentUploadTools: ['sp_upload_file'] }, 'sp_upload_file'),
    ).toBe(true);
    expect(
      supportsAttachmentUpload(
        { source: 'user', attachmentUploadTools: ['sp_upload_file'] },
        'sp_upload_file',
      ),
    ).toBe(false);
    expect(supportsAttachmentUpload({}, 'sp_upload_file')).toBe(false);
    expect(supportsAttachmentUpload(undefined, 'sp_upload_file')).toBe(false);
  });
});
