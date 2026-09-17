import React, { memo, useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { TooltipAnchor } from '@librechat/client';
import { Check, ChevronDown, Minus } from 'lucide-react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import MCPServerMenuItem from '~/components/MCP/MCPServerMenuItem';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import StackedMCPIcons from '~/components/MCP/StackedMCPIcons';
import { useHasAccess, useLocalize } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

function MCPSelectContent() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const { conversationId, storageContextKey, mcpServerManager: manager } = context ?? {};

  const menuStore = Ariakit.useMenuStore({ focusLoop: true });
  const isOpen = menuStore.useState('open');

  const selectedServers = useMemo(() => {
    if (!manager?.mcpValues || manager.mcpValues.length === 0) {
      return [];
    }
    const selectedSet = new Set(manager.mcpValues);
    return manager.selectableServers?.filter((s) => selectedSet.has(s.serverName));
  }, [manager?.selectableServers, manager?.mcpValues]);

  const displayText = useMemo(() => {
    // Deloitte Custom Change: Count from de-duplicated selectedServers so the label
    // cannot over-count when mcpValues contains duplicates.
    const selectedCount = selectedServers.length;
    if (selectedCount === 0) {
      return null;
    }
    if (selectedCount === 1) {
      const [server] = selectedServers;
      return server?.config?.title || server?.serverName;
    }
    return localize('com_ui_x_connected', { 0: selectedCount });
  }, [selectedServers, localize]);

  if (!manager) {
    return null;
  }

  const {
    isPinned,
    mcpValues,
    isInitializing,
    placeholderText,
    connectionStatus,
    selectableServers,
    getConfigDialogProps,
    toggleServerSelection,
    toggleSelectAll,
    allConnectorsSelected,
    someConnectorsSelected,
    getServerStatusIconProps,
  } = manager;

  if (!isPinned && mcpValues?.length === 0) {
    return null;
  }

  const configDialogProps = getConfigDialogProps();

  return (
    <>
      <Ariakit.MenuProvider store={menuStore}>
        <TooltipAnchor
          description={placeholderText}
          disabled={isOpen}
          render={
            <Ariakit.MenuButton
              // Deloitte Custom Change: data-testid added as a stable anchor for the guided tour spotlight
              data-testid="toolbar-toggle-mcp-servers"
              className={cn(
                'group relative inline-flex items-center justify-center gap-1.5',
                'border border-border-medium text-sm font-medium transition-all',
                'h-9 min-w-9 rounded-full bg-transparent px-2.5 shadow-sm',
                'hover:bg-surface-hover hover:shadow-md active:shadow-inner',
                'md:w-fit md:justify-start md:px-3',
                isOpen && 'bg-surface-hover',
              )}
            />
          }
        >
          <StackedMCPIcons selectedServers={selectedServers} maxIcons={3} iconSize="sm" />
          <span className="hidden truncate text-text-primary md:block">
            {displayText || placeholderText}
          </span>
          <ChevronDown
            className={cn(
              'hidden h-3 w-3 text-text-secondary transition-transform md:block',
              isOpen && 'rotate-180',
            )}
          />
        </TooltipAnchor>

        <Ariakit.Menu
          portal={true}
          gutter={8}
          modal={true}
          unmountOnHide={true}
          aria-label={localize('com_ui_mcp_servers')}
          // Deloitte Custom Change: Increase minimum width on MCP selector.
          className={cn(
            'z-50 flex min-w-[300px] max-w-[320px] flex-col rounded-xl',
            'border border-border-light bg-presentation p-1.5 shadow-lg',
            'origin-top opacity-0 transition-[opacity,transform] duration-200 ease-out',
            'data-[enter]:scale-100 data-[enter]:opacity-100',
            'scale-95 data-[leave]:scale-95 data-[leave]:opacity-0',
          )}
        >
          {/* Deloitte Custom Change: Bulk "Connect All" action. Label always reads "Connect
              All" — only the checkbox (checked/mixed/unchecked) reflects selection state.
              Uses MenuItemCheckbox (matching MCPServerMenuItem) and an explicit aria-checked
              override so assistive tech gets menuitemcheckbox semantics, including the
              mixed (indeterminate) state, instead of a purely visual checkbox. */}
          <Ariakit.MenuItemCheckbox
            name="mcp-connect-all"
            checked={allConnectorsSelected}
            aria-checked={someConnectorsSelected ? 'mixed' : allConnectorsSelected}
            hideOnClick={false}
            onClick={toggleSelectAll}
            aria-label={localize('com_ui_connect_all')}
            className={cn(
              'group mb-1 flex w-full cursor-pointer items-center justify-between gap-3',
              'rounded-lg border-b border-border-light px-2.5 py-2 outline-none transition-all duration-150',
              'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
            )}
          >
            <span className="text-sm font-medium text-text-primary">
              {localize('com_ui_connect_all')}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border',
                allConnectorsSelected || someConnectorsSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border-xheavy bg-transparent',
              )}
            >
              {allConnectorsSelected && <Check className="h-4 w-4" />}
              {someConnectorsSelected && <Minus className="h-4 w-4" />}
            </span>
          </Ariakit.MenuItemCheckbox>
          <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
            {selectableServers.map((server) => (
              <MCPServerMenuItem
                key={server.serverName}
                server={server}
                isSelected={mcpValues?.includes(server.serverName) ?? false}
                connectionStatus={connectionStatus}
                isInitializing={isInitializing}
                statusIconProps={getServerStatusIconProps(server.serverName)}
                onToggle={toggleServerSelection}
              />
            ))}
          </div>
        </Ariakit.Menu>
      </Ariakit.MenuProvider>
      {configDialogProps && (
        <MCPConfigDialog
          {...configDialogProps}
          conversationId={conversationId}
          storageContextKey={storageContextKey}
        />
      )}
    </>
  );
}

function MCPSelect() {
  const context = useBadgeRowContext();
  const { selectableServers } = context?.mcpServerManager ?? {};
  const canUseMcp = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });

  if (!canUseMcp || !selectableServers || selectableServers.length === 0) {
    return null;
  }

  return <MCPSelectContent />;
}

export default memo(MCPSelect);
