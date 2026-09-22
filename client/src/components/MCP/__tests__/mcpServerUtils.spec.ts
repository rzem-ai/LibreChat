// Deloitte Custom Change: tests
import type { MCPOptions } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import type { MCPServerStatusIconProps } from '../MCPServerStatusIcon';
import {
  getSelectedServerIcons,
  hasConfiguredIcon,
  hasLimitedAccess,
  resolveThemedIconPaths,
  shouldShowActionButton,
} from '../mcpServerUtils';

const makeServer = (
  serverName: string,
  configOverrides: Partial<MCPOptions> = {},
): MCPServerDefinition => ({
  serverName,
  config: { type: 'stdio', command: 'noop', ...configOverrides } as MCPOptions,
  effectivePermissions: 1,
});

const baseProps = (
  overrides: Partial<MCPServerStatusIconProps> = {},
): MCPServerStatusIconProps => ({
  serverName: 'test-server',
  onConfigClick: () => {},
  isInitializing: false,
  canCancel: false,
  onCancel: () => {},
  ...overrides,
});

describe('shouldShowActionButton', () => {
  it('returns false when there is no status information', () => {
    expect(shouldShowActionButton(null)).toBe(false);
    expect(shouldShowActionButton(baseProps())).toBe(false);
  });

  it('shows the connect button for a disconnected non-OBO server', () => {
    expect(
      shouldShowActionButton(
        baseProps({ serverStatus: { connectionState: 'disconnected', requiresOAuth: true } }),
      ),
    ).toBe(true);
  });

  it('shows the connect button for an errored non-OBO server', () => {
    expect(
      shouldShowActionButton(
        baseProps({ serverStatus: { connectionState: 'error', requiresOAuth: false } }),
      ),
    ).toBe(true);
  });

  it('hides the connect button for a disconnected OBO server — the checkbox connects it transparently', () => {
    expect(
      shouldShowActionButton(
        baseProps({
          serverStatus: {
            connectionState: 'disconnected',
            requiresOAuth: false,
            configuredObo: true,
          },
          hasCustomUserVars: false,
        }),
      ),
    ).toBe(false);
  });

  it('shows the connect button for an errored OBO server — errors always need a retry action', () => {
    expect(
      shouldShowActionButton(
        baseProps({
          serverStatus: { connectionState: 'error', requiresOAuth: false, configuredObo: true },
        }),
      ),
    ).toBe(true);
  });

  it('only shows the configure button for connected servers with custom vars', () => {
    expect(
      shouldShowActionButton(
        baseProps({
          serverStatus: { connectionState: 'connected', requiresOAuth: false },
          hasCustomUserVars: true,
        }),
      ),
    ).toBe(true);
    expect(
      shouldShowActionButton(
        baseProps({
          serverStatus: { connectionState: 'connected', requiresOAuth: false },
          hasCustomUserVars: false,
        }),
      ),
    ).toBe(false);
  });
});

describe('hasConfiguredIcon', () => {
  it('returns false when no icon field is set', () => {
    expect(hasConfiguredIcon({})).toBe(false);
    expect(hasConfiguredIcon({ iconPath: null, iconPathLight: null, iconPathDark: null })).toBe(
      false,
    );
  });

  it('returns true when any icon field is set', () => {
    expect(hasConfiguredIcon({ iconPath: '/icon.png' })).toBe(true);
    expect(hasConfiguredIcon({ iconPathLight: '/light.png' })).toBe(true);
    expect(hasConfiguredIcon({ iconPathDark: '/dark.png' })).toBe(true);
  });
});

describe('hasLimitedAccess', () => {
  it('returns true only for servers configured with limited access', () => {
    expect(hasLimitedAccess(makeServer('sharepoint', { limitedAccess: true }))).toBe(true);
    expect(hasLimitedAccess(makeServer('other-server'))).toBe(false);
  });
});

describe('resolveThemedIconPaths', () => {
  it('returns null for both themes when no icon field is set', () => {
    expect(resolveThemedIconPaths({})).toEqual({ light: null, dark: null });
  });

  it('uses each variant for its own theme when both are set', () => {
    expect(
      resolveThemedIconPaths({ iconPathLight: '/light.png', iconPathDark: '/dark.png' }),
    ).toEqual({ light: '/light.png', dark: '/dark.png' });
  });

  it('falls back to the shared iconPath when a themed variant is missing', () => {
    expect(resolveThemedIconPaths({ iconPath: '/icon.png' })).toEqual({
      light: '/icon.png',
      dark: '/icon.png',
    });
    expect(resolveThemedIconPaths({ iconPath: '/icon.png', iconPathDark: '/dark.png' })).toEqual({
      light: '/icon.png',
      dark: '/dark.png',
    });
  });

  it('falls back to the other theme variant when neither its own variant nor iconPath is set', () => {
    expect(resolveThemedIconPaths({ iconPathLight: '/light.png' })).toEqual({
      light: '/light.png',
      dark: '/light.png',
    });
    expect(resolveThemedIconPaths({ iconPathDark: '/dark.png' })).toEqual({
      light: '/dark.png',
      dark: '/dark.png',
    });
  });
});

describe('getSelectedServerIcons', () => {
  it('carries the themed icon fields through for a server with a custom icon', () => {
    const { icons } = getSelectedServerIcons([
      makeServer('sharepoint', { iconPathLight: '/light.png', iconPathDark: '/dark.png' }),
    ]);
    expect(icons).toEqual([
      {
        key: 'sharepoint',
        serverName: 'sharepoint',
        displayName: 'sharepoint',
        iconPath: null,
        iconPathLight: '/light.png',
        iconPathDark: '/dark.png',
      },
    ]);
  });

  it('consolidates servers with no configured icon into one default entry, listed last', () => {
    const { icons, overflowCount, defaultServerNames } = getSelectedServerIcons([
      makeServer('no-icon-a'),
      makeServer('branded', { iconPath: '/icon.png' }),
      makeServer('no-icon-b'),
    ]);
    expect(defaultServerNames).toEqual(['no-icon-a', 'no-icon-b']);
    expect(overflowCount).toBe(0);
    expect(icons.map((icon) => icon.key)).toEqual(['branded', '_default_']);
    expect(icons[1]).toMatchObject({ iconPath: null, iconPathLight: null, iconPathDark: null });
  });

  it('caps visible icons at maxIcons and reports the remainder as overflow', () => {
    const servers = ['a', 'b', 'c', 'd'].map((name) =>
      makeServer(name, { iconPath: `/${name}.png` }),
    );
    const { icons, overflowCount } = getSelectedServerIcons(servers, 2);
    expect(icons).toHaveLength(2);
    expect(overflowCount).toBe(2);
  });
});
