import { useMemo } from 'react';
import { isDark, useMediaQuery, useTheme } from '@librechat/client';
import { normalizeServerName, buildServerNameAliases } from 'librechat-data-provider';
import type { MCPServerDBObjectResponse } from 'librechat-data-provider';
import { useMCPServersQuery } from '~/data-provider';
import { resolveThemedIconPaths } from '~/components/MCP/mcpServerUtils';

/**
 * Deloitte Custom Change: maps each configured MCP server's normalized name (the
 * form tool keys and citation `serverName` fields carry, since the config itself
 * is keyed by the raw name) to its full config entry, so field-specific maps
 * below can share one pass over the server list instead of each re-iterating it.
 * Collisions are resolved via `buildServerNameAliases`, the same deterministic
 * routing the server uses, rather than "last/first configured name wins".
 */
function useMCPServerConfigMap(): Map<string, MCPServerDBObjectResponse> {
  const { data: servers } = useMCPServersQuery();

  return useMemo(() => {
    const map = new Map<string, MCPServerDBObjectResponse>();
    if (!servers) {
      return map;
    }
    const aliases = buildServerNameAliases(Object.keys(servers));
    for (const [normalizedName, rawName] of aliases) {
      const config = servers[rawName];
      if (config) {
        map.set(normalizedName, config);
      }
    }
    return map;
  }, [servers]);
}

// Deloitte Custom Change: light/dark themed MCP server icons.
/**
 * Whether dark mode is currently active. When the user's preference is
 * 'system', `ThemeProvider` only toggles the `<html>` class directly on OS
 * scheme changes — it never updates React state — so callers that need to
 * re-render on that change must observe the media query themselves, via the
 * same shared `useMediaQuery` hook other theme-reactive components use.
 */
export function useIsDarkMode(): boolean {
  const { theme } = useTheme();
  const systemIsDark = useMediaQuery('(prefers-color-scheme: dark)');
  return theme === 'system' ? systemIsDark : isDark(theme);
}

// Deloitte Custom Change: light/dark themed MCP server icons.
/**
 * Maps each configured MCP server's normalized name to the icon path for the
 * currently active theme, using the same light/dark/legacy fallback precedence
 * as `MCPServerIcon`. Servers with no icon configured are omitted.
 */
export function useMCPIconMap({ enabled = true }: { enabled?: boolean } = {}): Map<string, string> {
  const { data: servers } = useMCPServersQuery({ enabled });
  const dark = useIsDarkMode(); // Deloitte Custom Change: light/dark themed MCP server icons.

  return useMemo(() => {
    const map = new Map<string, string>();
    if (!servers) {
      return map;
    }
    for (const [serverName, config] of Object.entries(servers)) {
      // Deloitte Custom Change: light/dark themed MCP server icons.
      const { light, dark: darkIconPath } = resolveThemedIconPaths(config);
      const iconPath = dark ? darkIconPath : light;
      if (iconPath) {
        /** Looked up with a server name parsed out of a tool key, which carries the
         *  normalized form, so key the map the same way. */
        map.set(normalizeServerName(serverName), iconPath);
      }
    }
    return map;
  }, [servers, dark]);
}

/**
 * Configured MCP server names, matchable against a tool-key suffix. Includes both
 * the normalized form (what current tool keys carry) and the raw configured names
 * plus their alias targets, since messages/cached keys persisted before server
 * names were normalized in tool keys may still carry a raw-suffixed name.
 */
export function useMCPServerNames(): string[] {
  const { data: servers } = useMCPServersQuery();
  return useMemo(() => {
    if (!servers) {
      return [];
    }
    const rawNames = Object.keys(servers);
    const aliases = buildServerNameAliases(rawNames);
    return Array.from(new Set([...rawNames.map(normalizeServerName), ...rawNames, ...aliases.keys()]));
  }, [servers]);
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

