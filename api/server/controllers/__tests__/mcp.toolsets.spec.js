// Deloitte Custom Change: test suite for the `getMCPToolsets` controller — the
// MCP Gateway toolset-metadata endpoint backing the connector tooltip. Covers
// auth gating, missing-config fallback, the happy path, and graceful
// degradation to an empty list on any upstream failure.
const mockCreateAuthIdentityContext = jest.fn(() => ({ identity: 'context' }));
const mockResolveOboToken = jest.fn();
const mockGetToolsetsForUser = jest.fn();
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createAuthIdentityContext: (...args) => mockCreateAuthIdentityContext(...args),
  resolveOboToken: (...args) => mockResolveOboToken(...args),
  getToolsetsForUser: (...args) => mockGetToolsetsForUser(...args),
}));

const mockCreateOpenIDSessionTokenProvider = jest.fn(() => jest.fn());
jest.mock('~/server/services/OpenIDSessionRefresh', () => ({
  createOpenIDSessionTokenProvider: (...args) => mockCreateOpenIDSessionTokenProvider(...args),
}));

const mockExchangeOboToken = jest.fn();
jest.mock('~/server/services/OboTokenService', () => ({
  ...jest.requireActual('~/server/services/OboTokenService'),
  exchangeOboToken: (...args) => mockExchangeOboToken(...args),
}));

const mockResolveAllowlists = jest.fn().mockResolvedValue({
  allowedDomains: ['localhost'],
  allowedAddresses: [],
});
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getMCPServersRegistry: jest.fn(() => ({ resolveAllowlists: mockResolveAllowlists })),
}));

const { getMCPToolsets } = require('~/server/controllers/mcp');

/** Builds a minimal Express-response double that supports the chained `status().json()` calls under test. */
const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const ORIGINAL_ENV = process.env;

describe('getMCPToolsets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    mockResolveAllowlists.mockResolvedValue({
      allowedDomains: ['localhost'],
      allowedAddresses: [],
    });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns 401 when the request has no authenticated user', async () => {
    const res = createRes();
    await getMCPToolsets({ user: undefined }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(mockResolveOboToken).not.toHaveBeenCalled();
  });

  it('returns an empty list when MCP_GATEWAY_URL is not configured', async () => {
    delete process.env.MCP_GATEWAY_URL;
    process.env.MCP_GATEWAY_OBO_SCOPE = 'gateway.read';

    const res = createRes();
    await getMCPToolsets({ user: { id: 'user-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ toolsets: [] });
    expect(mockResolveOboToken).not.toHaveBeenCalled();
  });

  it('returns an empty list when MCP_GATEWAY_OBO_SCOPE is not configured', async () => {
    process.env.MCP_GATEWAY_URL = 'https://gateway.example.com/mcp';
    delete process.env.MCP_GATEWAY_OBO_SCOPE;

    const res = createRes();
    await getMCPToolsets({ user: { id: 'user-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ toolsets: [] });
    expect(mockResolveOboToken).not.toHaveBeenCalled();
  });

  it('resolves an OBO token and returns the gateway toolsets on the happy path', async () => {
    process.env.MCP_GATEWAY_URL = 'https://gateway.example.com/mcp';
    process.env.MCP_GATEWAY_OBO_SCOPE = 'gateway.read';
    mockResolveOboToken.mockResolvedValue({ access_token: 'obo-access-token' });
    const toolsets = [
      {
        name: 'sharepoint',
        description: 'd',
        userFriendlyDescription: 'u',
        useCases: [],
        access: [],
        limitations: [],
      },
    ];
    mockGetToolsetsForUser.mockResolvedValue(toolsets);

    const req = { user: { id: 'user-1', role: 'USER' } };
    const res = createRes();
    await getMCPToolsets(req, res);

    expect(mockResolveOboToken).toHaveBeenCalledWith(
      req.user,
      { scopes: 'gateway.read' },
      expect.any(Function),
      expect.any(Function),
      { identity: 'context' },
    );
    expect(mockResolveAllowlists).toHaveBeenCalledWith({ userId: 'user-1', role: 'USER' });
    expect(mockGetToolsetsForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      gatewayUrl: 'https://gateway.example.com/mcp',
      bearerToken: 'obo-access-token',
      allowedDomains: ['localhost'],
      allowedAddresses: [],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ toolsets });
  });

  it('degrades to an empty list when the OBO token exchange fails', async () => {
    process.env.MCP_GATEWAY_URL = 'https://gateway.example.com/mcp';
    process.env.MCP_GATEWAY_OBO_SCOPE = 'gateway.read';
    mockResolveOboToken.mockRejectedValue(new Error('exchange failed'));

    const res = createRes();
    await getMCPToolsets({ user: { id: 'user-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ toolsets: [] });
    expect(mockGetToolsetsForUser).not.toHaveBeenCalled();
  });

  it('degrades to an empty list when resolving allowlists fails', async () => {
    process.env.MCP_GATEWAY_URL = 'https://gateway.example.com/mcp';
    process.env.MCP_GATEWAY_OBO_SCOPE = 'gateway.read';
    mockResolveOboToken.mockResolvedValue({ access_token: 'obo-access-token' });
    mockResolveAllowlists.mockRejectedValue(new Error('registry unavailable'));

    const res = createRes();
    await getMCPToolsets({ user: { id: 'user-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ toolsets: [] });
    expect(mockGetToolsetsForUser).not.toHaveBeenCalled();
  });
});
