// Deloitte Custom Change: tests for the per-user cached MCP Gateway toolsets service.
import http from 'node:http';
import { CacheKeys } from 'librechat-data-provider';
import type { AddressInfo } from 'node:net';
import type { GatewayToolset } from './types';
import { resetHardenedOAuthFetchDispatchers } from '~/mcp/oauth/hardenedFetch';
import { getToolsetsForUser } from './service';
import { standardCache } from '~/cache';

const TOOLSET_A: GatewayToolset = {
  name: 'sharepoint',
  description: 'Internal sharepoint toolset',
  userFriendlyDescription: 'Search and summarize Sharepoint documents.',
  useCases: ['Find files by keyword'],
  access: ['All Deloitte Sharepoint'],
  limitations: ['Private Sharepoint folders'],
};

type TestServer = {
  port: number;
  requestCount: () => number;
  close: () => Promise<void>;
};

async function createLocalServer(toolsets: GatewayToolset[]): Promise<TestServer> {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ toolsets }));
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  const address = server.address() as AddressInfo;
  return {
    port: address.port,
    requestCount: () => requestCount,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('getToolsetsForUser', () => {
  afterEach(async () => {
    resetHardenedOAuthFetchDispatchers();
    const cache = standardCache(CacheKeys.MCP_GATEWAY_TOOLSETS);
    await cache.clear();
  });

  it('fetches and caches toolsets per user, reusing the cache on the next call', async () => {
    const server = await createLocalServer([TOOLSET_A]);
    try {
      const options = {
        userId: 'user-1',
        gatewayUrl: `http://localhost:${server.port}/mcp`,
        bearerToken: 'test-token',
        allowedDomains: ['localhost'],
      };

      const first = await getToolsetsForUser(options);
      const second = await getToolsetsForUser(options);

      expect(first).toEqual([TOOLSET_A]);
      expect(second).toEqual([TOOLSET_A]);
      expect(server.requestCount()).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('isolates cached toolsets per user', async () => {
    const server = await createLocalServer([TOOLSET_A]);
    try {
      await getToolsetsForUser({
        userId: 'user-1',
        gatewayUrl: `http://localhost:${server.port}/mcp`,
        bearerToken: 'test-token',
        allowedDomains: ['localhost'],
      });
      await getToolsetsForUser({
        userId: 'user-2',
        gatewayUrl: `http://localhost:${server.port}/mcp`,
        bearerToken: 'test-token',
        allowedDomains: ['localhost'],
      });

      expect(server.requestCount()).toBe(2);
    } finally {
      await server.close();
    }
  });

  it('rejects, and caches nothing, when the gateway is unreachable', async () => {
    const options = {
      userId: 'user-3',
      gatewayUrl: 'http://localhost:1/mcp',
      bearerToken: 'test-token',
      allowedDomains: ['localhost'],
    };

    await expect(getToolsetsForUser(options)).rejects.toThrow();
    expect(await standardCache(CacheKeys.MCP_GATEWAY_TOOLSETS).get('user-3')).toBeUndefined();
  });

  it('rejects when the gateway URL is not allowed, without contacting the gateway', async () => {
    const server = await createLocalServer([TOOLSET_A]);
    try {
      await expect(
        getToolsetsForUser({
          userId: 'user-4',
          gatewayUrl: `http://localhost:${server.port}/mcp`,
          bearerToken: 'test-token',
          allowedDomains: ['trusted.example.com'],
        }),
      ).rejects.toThrow(/allowed domains/);
      expect(server.requestCount()).toBe(0);
    } finally {
      await server.close();
    }
  });
});
