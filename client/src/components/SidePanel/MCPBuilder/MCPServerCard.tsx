import { useState, useRef, useEffect } from 'react';
import { MCPIcon } from '@librechat/client';
import { PermissionBits, hasPermissions } from 'librechat-data-provider';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks';
import { MCPServerTooltipTarget } from '~/components/MCP/MCPServerTooltip';
import McpOAuthDialog from '~/components/MCP/McpOAuthDialog';
import MCPServerIcon from '~/components/MCP/MCPServerIcon';
import { useMCPServerManager, useLocalize } from '~/hooks';
import { getStatusDotColor } from './MCPStatusBadge';
// Deloitte Custom Change: SharePoint MCP is limited to a subset of users.
import { LimitedAccessIcon } from '~/components/SidePanel/Agents/Advanced/ui';
import { hasConfiguredIcon, hasLimitedAccess } from '~/components/MCP/mcpServerUtils';
import MCPServerDialog from './MCPServerDialog';
import MCPCardActions from './MCPCardActions';
import { cn } from '~/utils';

interface MCPServerCardProps {
  server: MCPServerDefinition;
  getServerStatusIconProps: (serverName: string) => MCPServerStatusIconProps;
  // Deloitte Custom Change: Still threaded through for other consumers of this prop
  // (e.g. "Connect All" in MCPServerList/MCPBuilderPanel). MCPServerCard itself no
  // longer calls it directly — it reads initializeServer/getOAuthUrl from its own
  // useMCPServerManager() instance below instead, since that slice of state is a
  // shared Jotai atom and safe across instances, unlike the config-dialog-open state,
  // which stays local to whichever instance renders MCPConfigDialog.
  connectOrConfigureServer: (serverName: string, autoOpenOAuth?: boolean) => void;
  revokeOAuthForServer: (serverName: string) => void;
  canCreateEditMCPs: boolean;
}

/**
 * Compact card component for displaying an MCP server with status and actions.
 *
 * Visual design:
 * - Status shown via colored dot on icon (no separate badge - avoids redundancy)
 * - Action buttons clearly indicate available operations
 * - Consistent with MCPServerMenuItem in chat dropdown
 */
export default function MCPServerCard({
  server,
  getServerStatusIconProps,
  revokeOAuthForServer,
  canCreateEditMCPs,
}: MCPServerCardProps) {
  const localize = useLocalize();
  const triggerRef = useRef<HTMLDivElement>(null);
  // Deloitte Custom Change: revokeOAuthForServer keeps coming from the shared
  // MCPBuilderPanel instance (prop, destructured above); only initializeServer/getOAuthUrl
  // are read from this fresh instance, since that slice of state is a shared Jotai atom
  // and safe to read/call from any instance.
  const { initializeServer, getOAuthUrl } = useMCPServerManager();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [awaitingOAuth, setAwaitingOAuth] = useState(false);

  const statusIconProps = getServerStatusIconProps(server.serverName);
  const { serverStatus, onConfigClick, isInitializing, canCancel, onCancel, hasCustomUserVars } =
    statusIconProps;

  const canEditThisServer = hasPermissions(server.effectivePermissions, PermissionBits.EDIT);
  const displayName = server.config?.title || server.serverName;
  const description = server.config?.description;
  const statusDotColor = getStatusDotColor(serverStatus, isInitializing);
  const canEdit = canCreateEditMCPs && canEditThisServer;
  // Deloitte Custom Change: SharePoint MCP is limited to a subset of users.
  const limitedAccess = hasLimitedAccess(server);

  /** The shared flow URL is cleared when its initialization ends, so it can never be stale. */
  const sharedOAuthUrl = getOAuthUrl(server.serverName);

  useEffect(() => {
    if (!isInitializing) {
      setAwaitingOAuth(false);
    }
  }, [isInitializing]);

  /**
   * `autoOpenOAuth=false` surfaces the authorization URL in the OAuth dialog, whose Continue opens
   * it inside the tap. A tab opened after the initialize request is blocked on iOS home-screen apps.
   */
  const handleInitialize = async () => {
    /** If server has custom user vars and is not already connected, show config dialog first
     *  This ensures users can enter credentials before initialization attempts
     */
    if (hasCustomUserVars && serverStatus?.connectionState !== 'connected') {
      onConfigClick({ stopPropagation: () => {}, preventDefault: () => {} } as React.MouseEvent);
      return;
    }
    setAwaitingOAuth(false);
    const response = await initializeServer(server.serverName, false);
    if (response?.oauthRequired && response.oauthUrl) {
      setAwaitingOAuth(true);
    }
  };

  const handleRevoke = () => {
    revokeOAuthForServer(server.serverName);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDialogOpen(true);
  };

  // Determine status text for accessibility
  const getStatusText = () => {
    if (isInitializing) return localize('com_nav_mcp_status_initializing');
    if (!serverStatus) return localize('com_nav_mcp_status_unknown');
    const { connectionState, requiresOAuth } = serverStatus;
    if (connectionState === 'connecting') return localize('com_nav_mcp_status_connecting');
    if (serverStatus.requestScoped) return localize('com_nav_mcp_status_on_demand');
    if (connectionState === 'connected') return localize('com_nav_mcp_status_connected');
    if (connectionState === 'error') return localize('com_nav_mcp_status_error');
    if (connectionState === 'disconnected') {
      return requiresOAuth
        ? localize('com_nav_mcp_status_needs_auth')
        : localize('com_nav_mcp_status_disconnected');
    }
    return localize('com_nav_mcp_status_unknown');
  };

  return (
    <>
      {/* Deloitte Custom Change: Figma "MCP Tooltip hover" - connector identity, access tier, use
          cases. Trigger wraps the whole row so hovering anywhere on the card opens the tooltip. */}
      <MCPServerTooltipTarget
        server={server}
        trigger={
          <div
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5',
              'border border-border-light bg-transparent',
            )}
            aria-label={`${displayName} - ${getStatusText()}`}
          >
            {/* Server Icon with Status Dot */}
            <div className="relative flex-shrink-0">
              {/* Deloitte Custom Change: themed icon support (light/dark variants) */}
              {hasConfiguredIcon(server.config ?? {}) ? (
                <span aria-hidden="true">
                  <MCPServerIcon
                    iconPath={server.config?.iconPath ?? null}
                    iconPathLight={server.config?.iconPathLight ?? null}
                    iconPathDark={server.config?.iconPathDark ?? null}
                    alt=""
                    className="size-8 rounded-lg object-cover"
                  />
                </span>
              ) : (
                <div className="flex size-8 items-center justify-center rounded-lg bg-surface-tertiary">
                  <MCPIcon className="size-5 text-text-secondary" aria-hidden="true" />
                </div>
              )}
              {/* Status dot - color indicates connection state */}
              <div
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 size-3 rounded-full',
                  'border-2 border-surface-primary',
                  statusDotColor,
                  (isInitializing || serverStatus?.connectionState === 'connecting') &&
                    'animate-pulse',
                )}
                aria-hidden="true"
              />
            </div>

            {/* Server Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                  {displayName}
                </span>
                {/* Deloitte Custom Change: SharePoint MCP is limited to a subset of users. */}
                {limitedAccess && <LimitedAccessIcon />}
              </div>
              {description && <p className="truncate text-xs text-text-secondary">{description}</p>}
            </div>

            {/* Actions */}
            <div className="flex-shrink-0">
              <MCPCardActions
                serverName={server.serverName}
                serverStatus={serverStatus}
                isInitializing={isInitializing}
                canCancel={canCancel}
                hasCustomUserVars={hasCustomUserVars}
                canEdit={canEdit}
                editButtonRef={triggerRef}
                onEditClick={handleEditClick}
                onConfigClick={onConfigClick}
                onInitialize={handleInitialize}
                onCancel={onCancel}
                onRevoke={handleRevoke}
              />
            </div>
          </div>
        }
      />

      {/* Edit Dialog - separate from card */}
      {canEdit && (
        <MCPServerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          triggerRef={triggerRef}
          server={server}
        />
      )}
      <McpOAuthDialog
        open={awaitingOAuth && isInitializing && sharedOAuthUrl != null}
        onOpenChange={(open) => {
          if (!open) {
            setAwaitingOAuth(false);
          }
        }}
        serverName={server.serverName}
        oauthUrl={sharedOAuthUrl ?? ''}
        iconUrl={server.config?.iconPath}
      />
    </>
  );
}
