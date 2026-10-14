// Deloitte Custom Change: tests for the MCP Gateway toolset-list client.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GatewayToolset } from './types';
import { resetHardenedOAuthFetchDispatchers } from '~/mcp/oauth/hardenedFetch';
import { fetchGatewayToolsets } from './client';

const VALID_TOOLSET: GatewayToolset = {
  name: 'sharepoint',
  description: 'Internal sharepoint toolset',
  userFriendlyDescription: 'Search and summarize Sharepoint documents.',
  useCases: ['Find files by keyword'],
  access: ['All Deloitte Sharepoint'],
  limitations: ['Private Sharepoint folders'],
};

type TestServer = {
  port: number;
  lastRequest: () => { method?: string; url?: string; authorization?: string } | null;
  close: () => Promise<void>;
};

async function createLocalServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<TestServer> {
  let lastRequest: { method?: string; url?: string; authorization?: string } | null = null;
  const server = http.createServer((req, res) => {
    lastRequest = {
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
    };
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  const address = server.address() as AddressInfo;
  return {
    port: address.port,
    lastRequest: () => lastRequest,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('fetchGatewayToolsets', () => {
  afterEach(() => {
    resetHardenedOAuthFetchDispatchers();
  });

  it('fetches /toolsets off the gateway origin and returns the parsed list', async () => {
    const server = await createLocalServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ toolsets: [VALID_TOOLSET] }));
    });
    try {
      const result = await fetchGatewayToolsets({
        gatewayUrl: `http://localhost:${server.port}/mcp`,
        bearerToken: 'test-token',
        allowedDomains: ['localhost'],
      });

      expect(result).toEqual([VALID_TOOLSET]);
      expect(server.lastRequest()).toEqual(
        expect.objectContaining({
          method: 'GET',
          url: '/toolsets',
          authorization: 'Bearer test-token',
        }),
      );
    } finally {
      await server.close();
    }
  });

  it('throws when the gateway URL is not in the allowed domains list', async () => {
    const server = await createLocalServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ toolsets: [VALID_TOOLSET] }));
    });
    try {
      await expect(
        fetchGatewayToolsets({
          gatewayUrl: `http://localhost:${server.port}/mcp`,
          bearerToken: 'test-token',
          allowedDomains: ['trusted.example.com'],
        }),
      ).rejects.toThrow('not in the allowed domains list');
    } finally {
      await server.close();
    }
  });

  it('throws on a non-ok response', async () => {
    const server = await createLocalServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'boom' }));
    });
    try {
      await expect(
        fetchGatewayToolsets({
          gatewayUrl: `http://localhost:${server.port}/mcp`,
          bearerToken: 'test-token',
          allowedDomains: ['localhost'],
        }),
      ).rejects.toThrow('MCP Gateway toolsets request failed: 500');
    } finally {
      await server.close();
    }
  });

  it('throws when the response body fails schema validation', async () => {
    const server = await createLocalServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ toolsets: [{ name: 'sharepoint' }] }));
    });
    try {
      await expect(
        fetchGatewayToolsets({
          gatewayUrl: `http://localhost:${server.port}/mcp`,
          bearerToken: 'test-token',
          allowedDomains: ['localhost'],
        }),
      ).rejects.toThrow('MCP Gateway toolsets response failed validation');
    } finally {
      await server.close();
    }
  });
});
