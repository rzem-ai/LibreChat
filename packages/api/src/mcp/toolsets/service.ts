// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.
import { CacheKeys, Time } from 'librechat-data-provider';
import type { GatewayToolset } from './types';
import { fetchGatewayToolsets } from './client';
import { standardCache } from '~/cache';

export interface GetToolsetsForUserOptions {
  userId: string;
  gatewayUrl: string;
  bearerToken: string;
  allowedDomains?: string[] | null;
  allowedAddresses?: string[] | null;
  timeoutMs?: number;
}

/**
 * Returns the caller's RBAC-filtered MCP Gateway toolsets, cached per-user for a short TTL.
 * Operational failures (unreachable or slow gateway, HTTP error, invalid response, disallowed URL)
 * throw, so callers can report them instead of caching or returning them as an empty catalogue.
 * Only successful results are cached.
 */
export async function getToolsetsForUser({
  userId,
  gatewayUrl,
  bearerToken,
  allowedDomains,
  allowedAddresses,
  timeoutMs,
}: GetToolsetsForUserOptions): Promise<GatewayToolset[]> {
  const cache = standardCache(CacheKeys.MCP_GATEWAY_TOOLSETS, Time.FIVE_MINUTES);
  const cacheKey = userId;

  const cached = await cache.get(cacheKey);
  if (cached != null) {
    return cached as GatewayToolset[];
  }

  const toolsets = await fetchGatewayToolsets({
    gatewayUrl,
    bearerToken,
    allowedDomains,
    allowedAddresses,
    timeoutMs,
  });
  await cache.set(cacheKey, toolsets, Time.FIVE_MINUTES);
  return toolsets;
}
