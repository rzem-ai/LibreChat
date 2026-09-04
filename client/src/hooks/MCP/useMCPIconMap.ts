import { useMemo } from 'react';
import { normalizeServerName } from 'librechat-data-provider';
import type { MCPServerDBObjectResponse } from 'librechat-data-provider';
import { useMCPServersQuery } from '~/data-provider';

/**
 * Deloitte Custom Change: maps each configured MCP server's normalized name (the
 * form tool keys and citation `serverName` fields carry, since the config itself
 * is keyed by the raw name) to its full config entry, so field-specific maps
 * below can share one pass over the server list instead of each re-iterating it.
 */
function useMCPServerConfigMap(): Map<string, MCPServerDBObjectResponse> {
  const { data: servers } = useMCPServersQuery();

  return useMemo(() => {
    const map = new Map<string, MCPServerDBObjectResponse>();
    if (!servers) {
      return map;
    }
    for (const [serverName, config] of Object.entries(servers)) {
      map.set(normalizeServerName(serverName), config);
    }
    return map;
  }, [servers]);
}

// Deloitte Custom Change: reads from the shared config map instead of re-querying servers
export function useMCPIconMap(): Map<string, string> {
  const configMap = useMCPServerConfigMap();

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const [serverName, config] of configMap) {
      if (config.iconPath) {
        map.set(serverName, config.iconPath);
      }
    }
    return map;
  }, [configMap]);
}

/**
 * Configured MCP server names in the normalized form tool keys are built from,
 * so they can be matched against a key. The config is keyed by the raw name.
 */
export function useMCPServerNames(): string[] {
  const { data: servers } = useMCPServersQuery();
  return useMemo(() => (servers ? Object.keys(servers).map(normalizeServerName) : []), [servers]);
}

/** Deloitte Custom Change: maps each configured MCP server's normalized name to its display title. */
export function useMCPServerTitleMap(): Map<string, string> {
  const configMap = useMCPServerConfigMap();

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const [serverName, config] of configMap) {
      if (config.title) {
        map.set(serverName, config.title);
      }
    }
    return map;
  }, [configMap]);
}
