// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.
import type { GatewayToolset } from './types';
import { createHardenedOAuthFetch } from '~/mcp/oauth/hardenedFetch';
import { GatewayToolsetListResponseSchema } from './types';
import { GatewayToolsetsError } from './errors';
import { isOAuthUrlAllowed } from '~/auth';

export const DEFAULT_TOOLSETS_TIMEOUT_MS = 10_000;

export interface FetchGatewayToolsetsOptions {
  /** Base MCP Gateway URL (e.g. `MCP_GATEWAY_URL`, which may include a path like `/mcp`); only its origin is used. */
  gatewayUrl: string;
  bearerToken: string;
  allowedDomains?: string[] | null;
  allowedAddresses?: string[] | null;
  /** Deadline for the gateway request; defaults to {@link DEFAULT_TOOLSETS_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** Fetches the caller-visible, RBAC-filtered toolset list from the MCP Gateway's `GET /toolsets` endpoint. */
export async function fetchGatewayToolsets({
  gatewayUrl,
  bearerToken,
  allowedDomains,
  allowedAddresses,
  timeoutMs = DEFAULT_TOOLSETS_TIMEOUT_MS,
}: FetchGatewayToolsetsOptions): Promise<GatewayToolset[]> {
  const toolsetsUrl = new URL('/toolsets', new URL(gatewayUrl).origin).toString();

  if (!isOAuthUrlAllowed(toolsetsUrl, allowedDomains, allowedAddresses)) {
    throw new Error(`MCP Gateway toolsets URL is not in the allowed domains list: ${toolsetsUrl}`);
  }

  const hardenedFetch = createHardenedOAuthFetch({ allowedDomains, allowedAddresses });
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await hardenedFetch(toolsetsUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${bearerToken}` },
    signal,
  }).catch((error: unknown) => {
    if (signal.aborted) {
      throw new GatewayToolsetsError(504, 'MCP Gateway toolsets request timed out', {
        cause: error,
      });
    }
    throw error;
  });

  if (!response.ok) {
    throw new Error(
      `MCP Gateway toolsets request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body: unknown = await response.json().catch((error: unknown) => {
    throw signal.aborted
      ? new GatewayToolsetsError(504, 'MCP Gateway toolsets request timed out', { cause: error })
      : error;
  });
  const parsed = GatewayToolsetListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`MCP Gateway toolsets response failed validation: ${parsed.error.message}`);
  }

  return parsed.data.toolsets;
}
