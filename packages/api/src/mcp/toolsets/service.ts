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

const getCache = () => standardCache(CacheKeys.MCP_GATEWAY_TOOLSETS, Time.FIVE_MINUTES);

/** Reads the caller's cached toolsets, so callers can skip token exchange on a hit. */
export async function getCachedToolsets(userId: string): Promise<GatewayToolset[] | undefined> {
  const cached = await getCache().get(userId);
  return cached == null ? undefined : (cached as GatewayToolset[]);
}

/**
 * Fetches the caller's RBAC-filtered MCP Gateway toolsets and caches them per-user for a short TTL.
 * Operational failures (unreachable or slow gateway, HTTP error, invalid response, disallowed URL)
 * throw, so callers can report them instead of caching or returning them as an empty catalogue.
 * Only successful results are cached.
 */
export async function fetchAndCacheToolsets({
  userId,
  gatewayUrl,
  bearerToken,
  allowedDomains,
  allowedAddresses,
  timeoutMs,
}: GetToolsetsForUserOptions): Promise<GatewayToolset[]> {
  const toolsets = await fetchGatewayToolsets({
    gatewayUrl,
    bearerToken,
    allowedDomains,
    allowedAddresses,
    timeoutMs,
  });
  await getCache().set(userId, toolsets, Time.FIVE_MINUTES);
  return toolsets;
}

/** Returns the caller's toolsets from the per-user cache, falling back to the gateway on a miss. */
export async function getToolsetsForUser(
  options: GetToolsetsForUserOptions,
): Promise<GatewayToolset[]> {
  return (await getCachedToolsets(options.userId)) ?? fetchAndCacheToolsets(options);
}
