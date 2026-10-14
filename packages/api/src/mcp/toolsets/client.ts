// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.
import type { GatewayToolset } from './types';
import { createHardenedOAuthFetch } from '~/mcp/oauth/hardenedFetch';
import { GatewayToolsetListResponseSchema } from './types';
import { isOAuthUrlAllowed } from '~/auth';

export interface FetchGatewayToolsetsOptions {
  /** Base MCP Gateway URL (e.g. `MCP_GATEWAY_URL`, which may include a path like `/mcp`); only its origin is used. */
  gatewayUrl: string;
  bearerToken: string;
  allowedDomains?: string[] | null;
  allowedAddresses?: string[] | null;
}

/** Fetches the caller-visible, RBAC-filtered toolset list from the MCP Gateway's `GET /toolsets` endpoint. */
export async function fetchGatewayToolsets({
  gatewayUrl,
  bearerToken,
  allowedDomains,
  allowedAddresses,
}: FetchGatewayToolsetsOptions): Promise<GatewayToolset[]> {
  const toolsetsUrl = new URL('/toolsets', new URL(gatewayUrl).origin).toString();

  if (!isOAuthUrlAllowed(toolsetsUrl, allowedDomains, allowedAddresses)) {
    throw new Error(`MCP Gateway toolsets URL is not in the allowed domains list: ${toolsetsUrl}`);
  }

  const hardenedFetch = createHardenedOAuthFetch({ allowedDomains, allowedAddresses });
  const response = await hardenedFetch(toolsetsUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${bearerToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `MCP Gateway toolsets request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body: unknown = await response.json();
  const parsed = GatewayToolsetListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`MCP Gateway toolsets response failed validation: ${parsed.error.message}`);
  }

  return parsed.data.toolsets;
}
