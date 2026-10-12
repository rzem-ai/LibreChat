import { useMemo, useSyncExternalStore } from 'react';
import { isDark, useTheme } from '@librechat/client';
import { normalizeServerName, buildServerNameAliases } from 'librechat-data-provider';
import type { MCPServerDBObjectResponse } from 'librechat-data-provider';
import { resolveThemedIconPaths } from '~/components/MCP/mcpServerUtils';
import { useCatalogReady } from '../useCatalogWarmup';
import { useMCPServersQuery } from '~/data-provider';

// Deloitte Custom Change: single shared `matchMedia` subscription for OS dark-mode
// detection, so rendering many citations in one message installs exactly one
// native `change` listener total — every `useIsDarkMode` instance fans out from
// that one listener instead of each registering its own.
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';
let darkModeMedia: MediaQueryList | null = null;
const darkModeSubscribers = new Set<() => void>();

function getDarkModeMedia(): MediaQueryList {
  if (!darkModeMedia) {
    darkModeMedia = window.matchMedia(DARK_MODE_QUERY);
  }
  return darkModeMedia;
}

function notifyDarkModeSubscribers(): void {
  for (const subscriber of darkModeSubscribers) {
    subscriber();
  }
}

function subscribeToSystemDarkMode(onChange: () => void): () => void {
  const media = getDarkModeMedia();
  if (darkModeSubscribers.size === 0) {
    media.addEventListener('change', notifyDarkModeSubscribers);
  }
  darkModeSubscribers.add(onChange);
  return () => {
    darkModeSubscribers.delete(onChange);
    if (darkModeSubscribers.size === 0) {
      media.removeEventListener('change', notifyDarkModeSubscribers);
    }
  };
}

function getSystemIsDarkSnapshot(): boolean {
  return getDarkModeMedia().matches;
}

function getSystemIsDarkServerSnapshot(): boolean {
  return false;
}

/**
 * Deloitte Custom Change: maps each configured MCP server's normalized name (the
 * form tool keys and citation `serverName` fields carry, since the config itself
 * is keyed by the raw name) to its full config entry, so field-specific maps
 * below can share one pass over the server list instead of each re-iterating it.
 * Collisions are resolved via `buildServerNameAliases`, the same deterministic
 * routing the server uses, rather than "last/first configured name wins".
 */
function useMCPServerConfigMap({ enabled = true }: { enabled?: boolean } = {}): Map<
  string,
  MCPServerDBObjectResponse
> {
  // These observers mount from rendered messages, so they must not pull the
  // server catalog onto the first-render path ahead of the warmup schedule.
  const mcpServersReady = useCatalogReady('mcpServers');
  const { data: servers } = useMCPServersQuery({ enabled: enabled && mcpServersReady });

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
  const systemIsDark = useSyncExternalStore(
    subscribeToSystemDarkMode,
    getSystemIsDarkSnapshot,
    getSystemIsDarkServerSnapshot,
  );
  return theme === 'system' ? systemIsDark : isDark(theme);
}

/**
 * Deloitte Custom Change: resolves the icon path for a server config under the
 * currently active theme, using the same light/dark/legacy fallback precedence
 * as `MCPServerIcon`. Shared by `useMCPIconMap` and `useMCPServerMaps` so the
 * light/dark selection logic isn't duplicated across both.
 */
function getThemedIconPath(config: MCPServerDBObjectResponse, dark: boolean): string | null {
  const { light, dark: darkIconPath } = resolveThemedIconPaths(config);
  return dark ? darkIconPath : light;
}

// Deloitte Custom Change: light/dark themed MCP server icons.
/**
 * Maps each configured MCP server's normalized name to the icon path for the
 * currently active theme, using the same light/dark/legacy fallback precedence
 * as `MCPServerIcon`. Servers with no icon configured are omitted.
 */
export function useMCPIconMap({ enabled = true }: { enabled?: boolean } = {}): Map<string, string> {
  const configMap = useMCPServerConfigMap({ enabled });
  const dark = useIsDarkMode(); // Deloitte Custom Change: light/dark themed MCP server icons.

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const [normalizedName, config] of configMap) {
      const iconPath = getThemedIconPath(config, dark);
      if (iconPath) {
        map.set(normalizedName, iconPath);
      }
    }
    return map;
  }, [configMap, dark]);
}

/**
 * Configured MCP server names, matchable against a tool-key suffix. Includes both
 * the normalized form (what current tool keys carry) and the raw configured names
 * plus their alias targets, since messages/cached keys persisted before server
 * names were normalized in tool keys may still carry a raw-suffixed name.
 */
export function useMCPServerNames(): string[] {
  // Deloitte Custom Change: keep this query gated behind the same catalog-warmup
  // schedule as useMCPServerConfigMap, so names aren't pulled ahead of first paint.
  const mcpServersReady = useCatalogReady('mcpServers');
  const { data: servers } = useMCPServersQuery({ enabled: mcpServersReady });
  return useMemo(() => {
    if (!servers) {
      return [];
    }
    const rawNames = Object.keys(servers);
    const aliases = buildServerNameAliases(rawNames);
    return Array.from(
      new Set([...rawNames.map(normalizeServerName), ...rawNames, ...aliases.keys()]),
    );
  }, [servers]);
}

/**
 * Deloitte Custom Change: combines the title and icon maps behind a single
 * `useMCPServerConfigMap` call, for call sites (e.g. citations) that render many
 * times per message and need both, so the alias/config traversal isn't repeated
 * per map per render.
 */
export function useMCPServerMaps({ enabled = true }: { enabled?: boolean } = {}): {
  titleMap: Map<string, string>;
  iconMap: Map<string, string>;
} {
  const configMap = useMCPServerConfigMap({ enabled });
  const dark = useIsDarkMode(); // Deloitte Custom Change: light/dark themed MCP server icons.

  return useMemo(() => {
    const titleMap = new Map<string, string>();
    const iconMap = new Map<string, string>();
    for (const [normalizedName, config] of configMap) {
      if (config.title) {
        titleMap.set(normalizedName, config.title);
      }
      const iconPath = getThemedIconPath(config, dark);
      if (iconPath) {
        iconMap.set(normalizedName, iconPath);
      }
    }
    return { titleMap, iconMap };
  }, [configMap, dark]);
}
