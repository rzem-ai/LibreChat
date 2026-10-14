// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.
import { logger } from '@librechat/data-schemas';
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
}

/**
 * Returns the caller's RBAC-filtered MCP Gateway toolsets, cached per-user for a short TTL.
 * Never throws: any failure (missing config, unreachable gateway, invalid response) is
 * logged and degrades to an empty list, since this is a non-critical UI enhancement.
 */
export async function getToolsetsForUser({
  userId,
  gatewayUrl,
  bearerToken,
  allowedDomains,
  allowedAddresses,
}: GetToolsetsForUserOptions): Promise<GatewayToolset[]> {
  const cache = standardCache(CacheKeys.MCP_GATEWAY_TOOLSETS, Time.FIVE_MINUTES);
  const cacheKey = userId;

  const cached = await cache.get(cacheKey);
  if (cached != null) {
    return cached as GatewayToolset[];
  }

  try {
    const toolsets = await fetchGatewayToolsets({
      gatewayUrl,
      bearerToken,
      allowedDomains,
      allowedAddresses,
    });
    await cache.set(cacheKey, toolsets, Time.FIVE_MINUTES);
    return toolsets;
  } catch (error) {
    logger.warn('[getToolsetsForUser] Failed to fetch MCP Gateway toolsets', error);
    return [];
  }
}
