import { useMemo } from 'react';
import { isDark, useMediaQuery, useTheme } from '@librechat/client';
import { normalizeServerName } from 'librechat-data-provider';
import { useMCPServersQuery } from '~/data-provider';
import { resolveThemedIconPaths } from '~/components/MCP/mcpServerUtils';

// Deloitte Custom Change: light/dark themed MCP server icons.
/**
 * Whether dark mode is currently active. When the user's preference is
 * 'system', `ThemeProvider` only toggles the `<html>` class directly on OS
 * scheme changes — it never updates React state — so callers that need to
 * re-render on that change must observe the media query themselves, via the
 * same shared `useMediaQuery` hook other theme-reactive components use.
 */
function useIsDarkMode(): boolean {
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
export function useMCPIconMap(): Map<string, string> {
  const { data: servers } = useMCPServersQuery();
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

