import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ArtifactModes } from 'librechat-data-provider';
import { ChevronRight, WandSparkles } from 'lucide-react';
import ToolStateControl from '~/components/Chat/Input/ToolStateControl';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ArtifactsSubMenuProps extends React.HTMLAttributes<HTMLButtonElement> {
  isArtifactsPinned: boolean;
  setIsArtifactsPinned: (value: boolean) => void;
  artifactsMode: string;
  handleArtifactsToggle: () => void;
  handleShadcnToggle: () => void;
  handleCustomToggle: () => void;
  shadcnOnly?: boolean;
}

const ArtifactsSubMenu = React.forwardRef<HTMLButtonElement, ArtifactsSubMenuProps>(
  (
    {
      isArtifactsPinned,
      setIsArtifactsPinned,
      artifactsMode,
      handleArtifactsToggle,
      handleShadcnToggle,
      handleCustomToggle,
      shadcnOnly = false,
      className,
      ...props
    },
    ref,
  ) => {
    const localize = useLocalize();

    const menuStore = Ariakit.useMenuStore({
      focusLoop: true,
      showTimeout: 100,
      placement: 'right',
    });

    const isEnabled = artifactsMode !== '' && artifactsMode !== undefined && !shadcnOnly;
    const isShadcnEnabled = artifactsMode === ArtifactModes.SHADCNUI;
    const isCustomEnabled = artifactsMode === ArtifactModes.CUSTOM;

    return (
      <>
        <Ariakit.MenuProvider store={menuStore}>
          <Ariakit.MenuButton
            ref={ref}
            {...props}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              handleArtifactsToggle();
            }}
            onMouseEnter={() => {
              if (isEnabled) {
                menuStore.show();
              }
            }}
            className={cn(
              'flex w-full cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-surface-hover',
              className,
            )}
          >
            <div className="flex items-center gap-2">
              <WandSparkles className="icon-md" aria-hidden="true" />
              <span>{localize('com_ui_artifacts')}</span>
              {isEnabled && <ChevronRight className="ml-auto h-3 w-3" aria-hidden="true" />}
            </div>
            {/* Deloitte Custom Change: pin button or on/off checkbox, per `toolsDropdown.showPinButtons`. */}
            <ToolStateControl
              label={localize('com_ui_artifacts')}
              isPinned={isArtifactsPinned}
              setIsPinned={setIsArtifactsPinned}
              checked={artifactsMode !== '' && artifactsMode != null}
            />
          </Ariakit.MenuButton>

          {isEnabled && (
            <Ariakit.Menu
              portal={true}
              unmountOnHide={true}
              gutter={12}
              shift={24}
              flip="left bottom-end top-end"
              className={cn(
                'animate-popover-left z-40 flex min-w-[min(250px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col rounded-xl',
                'border border-border-light bg-surface-secondary shadow-lg',
              )}
            >
              <div className="px-2 py-1.5">
                <div className="mb-2 text-xs font-medium text-text-secondary">
                  {localize('com_ui_artifacts_options')}
                </div>

                {/* Include shadcn/ui Option */}
                <Ariakit.MenuItem
                  hideOnClick={false}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleShadcnToggle();
                  }}
                  className={cn(
                    'mb-1 flex items-center justify-between gap-2 rounded-lg px-2 py-2',
                    'cursor-pointer bg-surface-secondary text-text-primary outline-none transition-colors',
                    'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
                    isShadcnEnabled && 'bg-surface-active',
                  )}
                >
                  <span className="text-sm">{localize('com_ui_include_shadcnui' as any)}</span>
                  <div className="ml-auto flex items-center">
                    <Ariakit.MenuItemCheck checked={isShadcnEnabled} />
                  </div>
                </Ariakit.MenuItem>

                {/* Custom Prompt Mode Option */}
                <Ariakit.MenuItem
                  hideOnClick={false}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleCustomToggle();
                  }}
                  className={cn(
                    'mb-1 flex items-center justify-between gap-2 rounded-lg px-2 py-2',
                    'cursor-pointer bg-surface-secondary text-text-primary outline-none transition-colors',
                    'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
                    isCustomEnabled && 'bg-surface-active',
                  )}
                >
                  <span className="text-sm">{localize('com_ui_custom_prompt_mode' as any)}</span>
                  <div className="ml-auto flex items-center">
                    <Ariakit.MenuItemCheck checked={isCustomEnabled} />
                  </div>
                </Ariakit.MenuItem>
              </div>
            </Ariakit.Menu>
          )}
        </Ariakit.MenuProvider>
      </>
    );
  },
);

ArtifactsSubMenu.displayName = 'ArtifactsSubMenu';

export default React.memo(ArtifactsSubMenu);
