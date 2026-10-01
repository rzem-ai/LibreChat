// Deloitte Custom Change: test suite for the `getMCPTools` proactive reinitialize
// fallback (getMCPTools's `reinitMCPServerDeduped` helper) — covers gating the
// fallback to user-scoped servers, and the dedupe/backoff behavior around it.
const { mcpConfig } = require('@librechat/api');

jest.mock('~/config', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  getMCPManager: jest.fn(),
  getMCPServersRegistry: jest.fn(),
}));

const mockGetMCPServerTools = jest.fn();
jest.mock('~/server/services/Config', () => ({
  cacheMCPServerTools: jest.fn(),
  getMCPServerTools: (...args) => mockGetMCPServerTools(...args),
}));

const mockResolveConfigServers = jest.fn().mockResolvedValue({});
jest.mock('~/server/services/MCP', () => ({
  resolveConfigServers: (...args) => mockResolveConfigServers(...args),
  resolveMcpConfigNames: jest.fn().mockResolvedValue([]),
  resolveAllMcpConfigs: jest.fn(),
}));

const mockReinitMCPServer = jest.fn();
jest.mock('~/server/services/Tools/mcp', () => ({
  reinitMCPServer: (...args) => mockReinitMCPServer(...args),
}));

const mockFindPluginAuthsByKeys = jest.fn().mockResolvedValue([]);
jest.mock('~/models', () => ({
  findPluginAuthsByKeys: (...args) => mockFindPluginAuthsByKeys(...args),
}));

const { getMCPManager } = require('~/config');
const { resolveAllMcpConfigs } = require('~/server/services/MCP');
const { getMCPTools } = require('~/server/controllers/mcp');

/** OBO-scoped server config: `requiresUserScopedConnection` is true, so it's eligible for the reinit fallback. */
const oboServerConfig = {
  type: 'streamable-http',
  url: 'https://obo.example.com/mcp',
  obo: { scope: 'x' },
};
/** Plain YAML-sourced server config: not user-scoped, so it's never eligible for the reinit fallback. */
const yamlServerConfig = { type: 'streamable-http', url: 'https://internal.example.com/mcp' };

/** `customUserVars`-declaring server config: user-scoped via `requiresUserScopedConnection`, needs `userMCPAuthMap` to resolve its declared vars. */
const customUserVarsServerConfig = {
  type: 'streamable-http',
  url: 'https://custom.example.com/mcp',
  customUserVars: { API_KEY: { title: 'API Key' } },
};

/** `reinitMCPServer`'s resolved `availableTools` shape for a single discovered tool. */
const availableTools = {
  search_mcp_oboServer: { function: { description: 'search things' } },
};

/** Builds a minimal Express-response double that supports the chained `status().json()` calls under test. */
const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConfigServers.mockResolvedValue({});
  // Deloitte Custom Change: default baseline for every test below is "no cached
  // tools, no existing live connection" — the precondition that makes a server
  // eligible for the reinitMCPServer fallback in the first place.
  mockGetMCPServerTools.mockResolvedValue(null);
  getMCPManager.mockReturnValue({
    getServerToolFunctions: jest.fn().mockResolvedValue(null),
  });
});

describe('getMCPTools', () => {
  it('establishes a connection via reinitMCPServer for an uncached, user-scoped server', async () => {
    resolveAllMcpConfigs.mockResolvedValue({ oboServer: oboServerConfig });
    mockReinitMCPServer.mockResolvedValue({ success: true, availableTools });

    const res = createRes();
    await getMCPTools({ user: { id: 'user-1' } }, res);

    expect(mockReinitMCPServer).toHaveBeenCalledTimes(1);
    expect(mockReinitMCPServer).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: 'oboServer', serverConfig: oboServerConfig }),
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.servers.oboServer.tools).toEqual([
      expect.objectContaining({ pluginKey: 'search_mcp_oboServer' }),
    ]);
  });

  it('resolves and forwards userMCPAuthMap when reinitializing a customUserVars server', async () => {
    resolveAllMcpConfigs.mockResolvedValue({ customVarsServer: customUserVarsServerConfig });
    mockReinitMCPServer.mockResolvedValue({ success: true, availableTools });

    const res = createRes();
    await getMCPTools({ user: { id: 'user-1' } }, res);

    expect(mockFindPluginAuthsByKeys).toHaveBeenCalled();
    expect(mockReinitMCPServer).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'customVarsServer',
        userMCPAuthMap: expect.any(Object),
      }),
    );
  });

  it('does not call reinitMCPServer for an uncached, non-user-scoped server', async () => {
    resolveAllMcpConfigs.mockResolvedValue({ yamlServer: yamlServerConfig });

    const res = createRes();
    await getMCPTools({ user: { id: 'user-1' } }, res);

    expect(mockReinitMCPServer).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('dedupes overlapping reinitMCPServer calls for the same user/server by sharing the in-flight promise', async () => {
    resolveAllMcpConfigs.mockResolvedValue({ oboServer: oboServerConfig });
    let resolveReinit;
    mockReinitMCPServer.mockReturnValue(
      new Promise((resolve) => {
        resolveReinit = resolve;
      }),
    );

    const reqUser = { user: { id: 'user-concurrent' } };
    const firstRes = createRes();
    const secondRes = createRes();
    const firstCall = getMCPTools(reqUser, firstRes);
    const secondCall = getMCPTools(reqUser, secondRes);

    resolveReinit({ success: true, availableTools });
    await Promise.all([firstCall, secondCall]);

    expect(mockReinitMCPServer).toHaveBeenCalledTimes(1);
    for (const res of [firstRes, secondRes]) {
      expect(res.json.mock.calls[0][0].servers.oboServer.tools).toEqual([
        expect.objectContaining({ pluginKey: 'search_mcp_oboServer' }),
      ]);
    }
  });

  it('backs off from retrying reinitMCPServer for the same user/server after a failure', async () => {
    resolveAllMcpConfigs.mockResolvedValue({ oboServer: oboServerConfig });
    mockReinitMCPServer.mockResolvedValueOnce({
      success: false,
      availableTools: null,
      failureReason: 'unreachable',
    });

    const reqUser = { user: { id: 'user-backoff' } };
    await getMCPTools(reqUser, createRes());
    const res = createRes();
    await getMCPTools(reqUser, res);

    expect(mockReinitMCPServer).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].servers.oboServer.tools).toEqual([]);
  });

  it('backs off from retrying reinitMCPServer when it resolves success with no availableTools (e.g. connectionDeferred)', async () => {
    resolveAllMcpConfigs.mockResolvedValue({ oboServer: oboServerConfig });
    mockReinitMCPServer.mockResolvedValueOnce({
      success: true,
      availableTools: null,
      connectionDeferred: true,
    });

    const reqUser = { user: { id: 'user-deferred' } };
    await getMCPTools(reqUser, createRes());
    const res = createRes();
    await getMCPTools(reqUser, res);

    expect(mockReinitMCPServer).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].servers.oboServer.tools).toEqual([]);
  });

  it('backs off from retrying reinitMCPServer when it resolves success with an empty availableTools map', async () => {
    resolveAllMcpConfigs.mockResolvedValue({ oboServer: oboServerConfig });
    mockReinitMCPServer.mockResolvedValueOnce({
      success: true,
      availableTools: {},
    });

    const reqUser = { user: { id: 'user-empty-tools' } };
    await getMCPTools(reqUser, createRes());
    const res = createRes();
    await getMCPTools(reqUser, res);

    expect(mockReinitMCPServer).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].servers.oboServer.tools).toEqual([]);
  });

  it('retries reinitMCPServer once the backoff window elapses', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.now());
    try {
      resolveAllMcpConfigs.mockResolvedValue({ oboServer: oboServerConfig });
      mockReinitMCPServer.mockResolvedValueOnce({
        success: false,
        availableTools: null,
        failureReason: 'unreachable',
      });
      mockReinitMCPServer.mockResolvedValueOnce({ success: true, availableTools });

      const reqUser = { user: { id: 'user-backoff-retry' } };
      await getMCPTools(reqUser, createRes());
      jest.advanceTimersByTime(mcpConfig.CB_BASE_BACKOFF_MS);

      const res = createRes();
      await getMCPTools(reqUser, res);

      expect(mockReinitMCPServer).toHaveBeenCalledTimes(2);
      expect(res.json.mock.calls[0][0].servers.oboServer.tools).toEqual([
        expect.objectContaining({ pluginKey: 'search_mcp_oboServer' }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
