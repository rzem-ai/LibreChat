import type { MCPServerStatus } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import type { MCPServerStatusIconProps } from './MCPServerStatusIcon';

export type { MCPServerStatus };

// Deloitte Custom Change: light/dark themed MCP server icons.
/** The set of icon-path fields a server's config can provide, shared across icon-related types. */
export interface ThemedIconPaths {
  iconPath: string | null;
  iconPathLight: string | null;
  iconPathDark: string | null;
}

// Deloitte Custom Change: light/dark themed MCP server icons.
const NO_ICON_PATHS: ThemedIconPaths = {
  iconPath: null,
  iconPathLight: null,
  iconPathDark: null,
};

// Deloitte Custom Change: SelectedIconInfo now carries the light/dark icon variants too.
export interface SelectedIconInfo extends ThemedIconPaths {
  key: string;
  serverName: string;
  displayName: string;
}

export type ConnectionStatusMap = Record<string, MCPServerStatus>;

// Deloitte Custom Change: light/dark themed MCP server icons.
/** Whether any icon path is configured for a server, i.e. it shouldn't fall back to the generic icon. */
export function hasConfiguredIcon(icons: Partial<ThemedIconPaths>): boolean {
  return Boolean(icons.iconPath || icons.iconPathLight || icons.iconPathDark);
}

/** Whether this server is marked by its operator as having limited access. */
export function hasLimitedAccess(server: Pick<MCPServerDefinition, 'config'>): boolean {
  return server.config?.limitedAccess === true;
}

// Deloitte Custom Change: light/dark themed MCP server icons.
/**
 * Resolves the icon path to show in each theme, given a server's configured icon fields.
 * Precedence per theme: its own variant, then the shared `iconPath`, then (as a last resort,
 * so a themed icon is never simply missing) the other theme's variant.
 */
export function resolveThemedIconPaths(icons: Partial<ThemedIconPaths>): {
  light: string | null;
  dark: string | null;
} {
  const { iconPath, iconPathLight, iconPathDark } = icons;
  return {
    light: iconPathLight || iconPath || iconPathDark || null,
    dark: iconPathDark || iconPath || iconPathLight || null,
  };
}

/**
 * Generates a list of icons to display for selected MCP servers.
 * - Custom icons are shown individually
 * - Multiple default icons are consolidated into one
 * - Limited to maxIcons with overflow count
 */
export function getSelectedServerIcons(
  selectedServers: MCPServerDefinition[],
  maxIcons: number = 3,
): { icons: SelectedIconInfo[]; overflowCount: number; defaultServerNames: string[] } {
  const customIcons: SelectedIconInfo[] = [];
  const defaultServerNames: string[] = [];

  for (const server of selectedServers) {
    const displayName = server.config?.title || server.serverName;
    // Deloitte Custom Change: light/dark themed MCP server icons.
    const { iconPath, iconPathLight, iconPathDark } = server.config ?? {};
    if (hasConfiguredIcon({ iconPath, iconPathLight, iconPathDark })) {
      customIcons.push({
        key: server.serverName,
        serverName: server.serverName,
        iconPath: iconPath ?? null,
        // Deloitte Custom Change: light/dark themed MCP server icons.
        iconPathLight: iconPathLight ?? null,
        iconPathDark: iconPathDark ?? null,
        displayName,
      });
    } else {
      defaultServerNames.push(server.serverName);
    }
  }

  // Add one default icon entry if any server uses default icon
  // Custom icons are prioritized first, default icon comes last
  const allIcons: SelectedIconInfo[] =
    defaultServerNames.length > 0
      ? [
          ...customIcons,
          {
            key: '_default_',
            serverName: defaultServerNames[0],
            displayName: 'MCP',
            ...NO_ICON_PATHS, // Deloitte Custom Change: light/dark themed MCP server icons.
          },
        ]
      : customIcons;

  const visibleIcons = allIcons.slice(0, maxIcons);
  const overflowCount = Math.max(0, allIcons.length - maxIcons);

  return { icons: visibleIcons, overflowCount, defaultServerNames };
}

/**
 * Unified status color system following UX best practices:
 * - Green: Connected/Active (success)
 * - Blue: Connecting/In-progress or request-scoped on-demand
 * - Amber: Needs user action (OAuth required, config missing)
 * - Gray: Disconnected/Inactive (neutral - server is simply off)
 * - Red: Error (failed, needs retry)
 *
 * Key insight: "Disconnected" is neutral (gray), not a warning.
 * Amber is reserved for states requiring user intervention.
 */
export function getStatusColor(
  serverName: string,
  connectionStatus?: ConnectionStatusMap,
  isInitializing?: (serverName: string) => boolean,
): string {
  // In-progress states: blue
  if (isInitializing?.(serverName)) {
    return 'bg-status-info';
  }

  const status = connectionStatus?.[serverName];
  if (!status) {
    return 'bg-status-neutral';
  }

  const { connectionState, requiresOAuth, requestScoped } = status;

  // Connecting: blue (in progress)
  if (connectionState === 'connecting') {
    return 'bg-status-info';
  }

  if (requestScoped) {
    return 'bg-status-info';
  }

  // Connected: green (success)
  if (connectionState === 'connected') {
    return 'bg-status-success';
  }

  // Error: red
  if (connectionState === 'error') {
    return 'bg-status-error';
  }

  // Disconnected: check if needs action or just inactive
  if (connectionState === 'disconnected') {
    // Needs OAuth = amber (requires user action)
    if (requiresOAuth) {
      return 'bg-status-warning';
    }
    // Simply disconnected = gray (neutral/inactive)
    return 'bg-status-neutral';
  }

  return 'bg-status-neutral';
}

export function getStatusTextKey(
  serverName: string,
  connectionStatus?: ConnectionStatusMap,
  isInitializing?: (serverName: string) => boolean,
): string {
  if (isInitializing?.(serverName)) {
    return 'com_nav_mcp_status_initializing';
  }

  const status = connectionStatus?.[serverName];
  if (!status) {
    return 'com_nav_mcp_status_unknown';
  }

  const { connectionState, requiresOAuth, requestScoped } = status;

  if (connectionState === 'connecting') {
    return 'com_nav_mcp_status_connecting';
  }

  if (requestScoped) {
    return 'com_nav_mcp_status_on_demand';
  }

  // Special case: disconnected but needs OAuth shows different text
  if (connectionState === 'disconnected' && requiresOAuth) {
    return 'com_nav_mcp_status_needs_auth';
  }

  const keyMap: Record<string, string> = {
    connected: 'com_nav_mcp_status_connected',
    connecting: 'com_nav_mcp_status_connecting',
    disconnected: 'com_nav_mcp_status_disconnected',
    error: 'com_nav_mcp_status_error',
  };

  return keyMap[connectionState] || 'com_nav_mcp_status_unknown';
}

/**
 * Determines if a server requires user action to connect.
 * Used to show action buttons and amber status color.
 */
export function serverNeedsAction(
  serverStatus?: MCPServerStatus,
  _hasCustomUserVars?: boolean,
): boolean {
  if (!serverStatus) return false;
  const { connectionState, requiresOAuth, requestScoped } = serverStatus;

  if (requestScoped && connectionState !== 'connecting') return false;

  // Needs OAuth authentication
  if (connectionState === 'disconnected' && requiresOAuth) return true;

  // Has error - needs retry
  if (connectionState === 'error') return true;

  return false;
}

// Deloitte Custom Change: OBO (on-behalf-of) servers authenticate silently, so they
// should not require a manual "Connect" click. See isSilentlyConnectableOboServer below.
/**
 * Whether a disconnected server is an OBO (on-behalf-of) server that
 * authenticates silently on every tool call — so it never needs a manual
 * "Connect" click, unless it also has custom vars still to be filled in.
 * A server can be configured for both OBO and OAuth at once; `requiresOAuth`
 * is the authoritative "needs interactive user action" flag, so it must be
 * false too, or a server stuck behind OAuth would have its only Connect
 * affordance hidden. Shared by every surface that decides whether to show a
 * Connect button.
 */
export function isSilentlyConnectableOboServer(
  serverStatus:
    | Pick<MCPServerStatus, 'connectionState' | 'configuredObo' | 'requiresOAuth'>
    | undefined,
  hasCustomUserVars: boolean | undefined,
): boolean {
  return (
    serverStatus?.connectionState === 'disconnected' &&
    serverStatus?.configuredObo === true &&
    serverStatus?.requiresOAuth === false &&
    hasCustomUserVars === false
  );
}

/**
 * Request-scoped servers are usable without an idle transport connection once
 * their authorization requirement is satisfied. Agent tooling uses this
 * readiness signal to attach the runtime wildcard instead of waiting for a
 * tool catalog that can only be discovered during a chat request.
 */
export function isMCPServerReadyForAgent(
  status: MCPServerStatus | undefined,
  requestScoped: boolean,
  hasCustomUserVars = false,
): boolean {
  if (requestScoped && hasCustomUserVars && status?.configurationState !== 'configured') {
    return false;
  }
  if (status?.connectionState === 'connected') {
    return true;
  }
  if (!requestScoped) {
    return false;
  }
  return (
    status?.authorizationState === 'not_required' || status?.authorizationState === 'authorized'
  );
}

/**
 * Determines if an action button should be shown for a server status.
 * Returns true only when the button would be actionable (not just informational).
 */
export function shouldShowActionButton(statusIconProps?: MCPServerStatusIconProps | null): boolean {
  if (!statusIconProps) return false;

  const { serverStatus, canCancel, hasCustomUserVars, isInitializing } = statusIconProps;

  // Show cancel button during OAuth flow
  if (isInitializing && canCancel) return true;
  // Don't show spinner-only state (no action available)
  if (isInitializing) return false;

  if (!serverStatus) return false;
  const { connectionState, requiresOAuth, requestScoped } = serverStatus;

  // Request-scoped servers can only be initialized with an active MCP request context,
  // but their per-user variables must remain configurable while idle.
  if ((connectionState === 'disconnected' || connectionState === 'error') && requestScoped) {
    return hasCustomUserVars === true;
  }
  if (connectionState === 'connected' && requestScoped) return hasCustomUserVars === true;
  // Error always needs a retry action.
  if (connectionState === 'error') return true;
  // Deloitte Custom Change: Disconnected OBO servers connect silently, so no button
  // is needed unless custom vars still need to be entered.
  if (connectionState === 'disconnected') {
    return !isSilentlyConnectableOboServer(serverStatus, hasCustomUserVars);
  }
  // Show a cancel action for pending OAuth connections.
  if (connectionState === 'connecting' && requiresOAuth && canCancel) return true;
  // Don't show connecting spinner when no action is available.
  if (connectionState === 'connecting') return false;
  // Deloitte Custom Change: Connected: only show if there's custom-var config to manage
  // (matches the ConfigureButton condition in MCPServerStatusIcon — requiresOAuth alone
  // renders nothing).
  if (connectionState === 'connected') return Boolean(hasCustomUserVars);

  return false;
}
