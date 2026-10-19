import React, { memo, useRef, useMemo, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
// Deloitte Custom Change: import Check and Minus icons for the Connect All checkbox
import { Check, ChevronDown, Minus } from 'lucide-react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { TooltipAnchor, composerControlClasses } from '@librechat/client';
import MCPServerMenuItem from '~/components/MCP/MCPServerMenuItem';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import StackedMCPIcons from '~/components/MCP/StackedMCPIcons';
import { useToolsDropdownConfig } from '~/hooks/Plugins/useToolsDropdownConfig';
import { useMCPRefresh } from '~/hooks/MCP/useMCPRefresh';
import { useHasAccess, useLocalize } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

function MCPSelectContent() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const { conversationId, storageContextKey, mcpServerManager: manager } = context ?? {};

  const { isDropdownOnly } = useToolsDropdownConfig();
  const menuStore = Ariakit.useMenuStore({ focusLoop: true });
  const isOpen = menuStore.useState('open');
  const configDialogOpen = manager?.getConfigDialogProps()?.isOpen === true;
  useMCPRefresh({
    enabled: (isOpen || configDialogOpen) && (manager?.availableMCPServers.length ?? 0) > 0,
  });

  /**
   * The menu closes with the dialog it launched. Ariakit only takes Escape for
   * a menu when the event target is the menu, its trigger, or `body`, so while
   * the config dialog holds focus the menu never sees it — the Escape that
   * closes the dialog leaves the menu open behind it, and `disabled={isOpen}`
   * then makes its trigger unclickable, stranding the reader
   * (`mcp-oauth-readiness` e2e). Keyed on the dialog CLOSING, not opening: the
   * menu stays mounted underneath while the dialog is up, which is where its
   * server rows are read from.
   */
  const configDialogWasOpen = useRef(false);
  useEffect(() => {
    if (configDialogWasOpen.current && !configDialogOpen) {
      menuStore.hide();
    }
    configDialogWasOpen.current = configDialogOpen;
  }, [configDialogOpen, menuStore]);

  const selectedServers = useMemo(() => {
    if (!manager?.mcpValues || manager.mcpValues.length === 0) {
      return [];
    }
    const selectedSet = new Set(manager.mcpValues);
    return manager.selectableServers?.filter((s) => selectedSet.has(s.serverName)) ?? [];
  }, [manager?.selectableServers, manager?.mcpValues]);

  /** Counts what the menu actually offers, never the raw selection: a name the
   *  catalog has not returned — or one the admin has hidden — renders no row,
   *  and billing it to the badge reads as a server that cannot be turned off. */
  const displayText = useMemo(() => {
    // Deloitte Custom Change: Count from de-duplicated selectedServers so the label
    // cannot over-count when mcpValues contains duplicates.
    const selectedCount = selectedServers.length;
    if (selectedCount === 0) {
      return null;
    }
    if (selectedCount === 1) {
      // Deloitte Custom Change: optional chaining guards against an entry that
      // disappeared from the catalog between selection and this render.
      const [server] = selectedServers;
      return server?.config?.title || server?.serverName;
    }
    // Deloitte Custom Change: "connected" wording matches the Connect All feature
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

  if (!isPinned && (mcpValues?.length === 0 || isDropdownOnly('mcp'))) {
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
              id="toolbar-toggle-mcp-servers"
              className={cn(
                composerControlClasses(),
                'min-w-theme-control px-2.5 md:w-fit md:justify-start md:px-theme-normal',
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
                // Deloitte Custom Change: sized up to match the per-server checkboxes below
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border',
                // Deloitte Custom Change: recolored to bg-surface-submit to match the submit button
                allConnectorsSelected || someConnectorsSelected
                  ? 'border-surface-submit bg-surface-submit text-text-on-status'
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
