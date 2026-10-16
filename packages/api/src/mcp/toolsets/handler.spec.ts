// Deloitte Custom Change: tests for the `GET /api/mcp/toolsets` handler. Runs the real OBO
// resolution, allowlist check, fetch and schema validation against a local gateway double;
// only identity/session wiring is injected.
import http from 'node:http';
import { CacheKeys } from 'librechat-data-provider';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
import type { GatewayToolset } from './types';
import type { ServerRequest } from '~/types';
import { resetHardenedOAuthFetchDispatchers } from '~/mcp/oauth/hardenedFetch';
import { createGetMCPToolsets } from './handler';
import { standardCache } from '~/cache';

const TOOLSET: GatewayToolset = {
  name: 'sharepoint',
  description: 'd',
  userFriendlyDescription: 'u',
  useCases: [],
  access: [],
  limitations: [],
};

const ORIGINAL_ENV = process.env;

function createRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res = { headersSent: false } as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

async function createGateway(
  respond: (res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => respond(res));
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const okGateway = () =>
  createGateway((res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ toolsets: [TOOLSET] }));
  });

const exchangeOboToken = jest.fn();
const resolveAllowlists = jest.fn();
const createHandler = () =>
  createGetMCPToolsets({
    getTenantId: () => undefined,
    exchangeOboToken,
    createUpstreamTokenProvider: () => async () => ({
      access_token: 'upstream-token',
      expires_at: Date.now() + 3_600_000,
    }),
    resolveAllowlists,
  });

const request = (user?: { id: string; role?: string }) =>
  ({ user: user && { ...user, openidId: 'oid' } }) as unknown as ServerRequest;

describe('createGetMCPToolsets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, MCP_GATEWAY_OBO_SCOPE: 'gateway.read' };
    exchangeOboToken.mockResolvedValue({ access_token: 'obo-token', expires_in: 3600 });
    resolveAllowlists.mockResolvedValue({ allowedDomains: ['localhost'], allowedAddresses: [] });
  });

  afterEach(async () => {
    resetHardenedOAuthFetchDispatchers();
    await standardCache(CacheKeys.MCP_GATEWAY_TOOLSETS).clear();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns 401 without an authenticated user', async () => {
    const res = createRes();
    await createHandler()(request(), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(exchangeOboToken).not.toHaveBeenCalled();
  });

  it.each(['MCP_GATEWAY_URL', 'MCP_GATEWAY_OBO_SCOPE'])(
    'returns 503, not an empty catalogue, when %s is not configured',
    async (missing) => {
      process.env.MCP_GATEWAY_URL = 'https://gateway.example.com/mcp';
      delete process.env[missing];
      const res = createRes();
      await createHandler()(request({ id: 'user-1' }), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(exchangeOboToken).not.toHaveBeenCalled();
    },
  );

  it('exchanges an OBO token and returns the gateway toolsets', async () => {
    const gateway = await okGateway();
    try {
      process.env.MCP_GATEWAY_URL = `http://localhost:${gateway.port}/mcp`;
      const res = createRes();
      await createHandler()(request({ id: 'user-1', role: 'USER' }), res);

      expect(resolveAllowlists).toHaveBeenCalledWith({ userId: 'user-1', role: 'USER' });
      expect(exchangeOboToken.mock.calls[0][1]).toBe('upstream-token');
      expect(exchangeOboToken.mock.calls[0][2]).toBe('gateway.read');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ toolsets: [TOOLSET] });
    } finally {
      await gateway.close();
    }
  });

  it('returns 502 when the OBO token exchange fails', async () => {
    process.env.MCP_GATEWAY_URL = 'https://gateway.example.com/mcp';
    exchangeOboToken.mockRejectedValue(new Error('exchange failed'));
    const res = createRes();
    await createHandler()(request({ id: 'user-1' }), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ message: 'Failed to load MCP Gateway toolsets' });
  });

  it('returns 502 when resolving allowlists fails', async () => {
    process.env.MCP_GATEWAY_URL = 'https://gateway.example.com/mcp';
    resolveAllowlists.mockRejectedValue(new Error('registry unavailable'));
    const res = createRes();
    await createHandler()(request({ id: 'user-1' }), res);

    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('returns 502 when the gateway responds with an error status', async () => {
    const gateway = await createGateway((res) => {
      res.writeHead(500);
      res.end();
    });
    try {
      process.env.MCP_GATEWAY_URL = `http://localhost:${gateway.port}/mcp`;
      const res = createRes();
      await createHandler()(request({ id: 'user-1' }), res);

      expect(res.status).toHaveBeenCalledWith(502);
    } finally {
      await gateway.close();
    }
  });
});
