import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronRight } from 'lucide-react';
import { MCPIcon } from '@librechat/client';
import ToolStateControl from '~/components/Chat/Input/ToolStateControl';
import MCPServerMenuItem from '~/components/MCP/MCPServerMenuItem';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useMCPRefresh } from '~/hooks/MCP/useMCPRefresh';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MCPSubMenuProps extends React.HTMLAttributes<HTMLButtonElement> {
  placeholder?: string;
}

const MCPSubMenu = React.forwardRef<HTMLButtonElement, MCPSubMenuProps>(
  ({ placeholder, className, ...props }, ref) => {
    const localize = useLocalize();
    const context = useBadgeRowContext();
    const { storageContextKey, mcpServerManager } = context ?? {};

    const menuStore = Ariakit.useMenuStore({
      focusLoop: true,
      showTimeout: 100,
      placement: 'right',
    });

    const isOpen = menuStore.useState('open');
    const configDialogOpen = mcpServerManager?.getConfigDialogProps()?.isOpen === true;
    useMCPRefresh({
      enabled:
        (isOpen || configDialogOpen) && (mcpServerManager?.selectableServers.length ?? 0) > 0,
    });

    if (!mcpServerManager) {
      return null;
    }

    const {
      isPinned,
      mcpValues,
      setIsPinned,
      isInitializing,
      placeholderText,
      connectionStatus,
      selectableServers,
      getConfigDialogProps,
      toggleServerSelection,
      getServerStatusIconProps,
    } = mcpServerManager;

    if (!selectableServers || selectableServers.length === 0) {
      return null;
    }

    const configDialogProps = getConfigDialogProps();

    return (
      <>
        <Ariakit.MenuProvider store={menuStore}>
          <Ariakit.MenuButton
            ref={ref}
            {...props}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              menuStore.toggle();
            }}
            className={cn(
              'flex w-full cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-surface-hover',
              className,
            )}
          >
            <div className="flex items-center gap-2">
              <MCPIcon className="h-5 w-5 flex-shrink-0 text-text-primary" aria-hidden="true" />
              <span>{placeholder || placeholderText}</span>
              <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            </div>
            {/* Deloitte Custom Change: pin button follows `toolsDropdown.showPinButtons`. */}
            <ToolStateControl
              label={placeholder || placeholderText}
              isPinned={isPinned}
              setIsPinned={setIsPinned}
            />
          </Ariakit.MenuButton>

          <Ariakit.Menu
            portal={true}
            unmountOnHide={true}
            gutter={12}
            flip="left bottom-end top-end"
            aria-label={localize('com_ui_mcp_servers')}
            // Deloitte Custom Change: Increase minimum width on MCP selector so the dropdown
            // doesn't shrink/snap during auth; clamped to viewport width on small screens.
            className={cn(
              'animate-popover-left z-40 ml-3 flex min-w-[min(300px,calc(100vw-1rem))] max-w-[min(320px,calc(100vw-1rem))] flex-col rounded-xl',
              'border border-border-light bg-presentation p-1.5 shadow-lg',
            )}
          >
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
          <MCPConfigDialog {...configDialogProps} storageContextKey={storageContextKey} />
        )}
      </>
    );
  },
);

MCPSubMenu.displayName = 'MCPSubMenu';

export default React.memo(MCPSubMenu);
