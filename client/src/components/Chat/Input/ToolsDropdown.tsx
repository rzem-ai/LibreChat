import React, { useState, useMemo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { TooltipAnchor, DropdownPopup, VectorIcon } from '@librechat/client';
import { Brain, Globe, ScrollText, Settings, Settings2, TerminalSquareIcon } from 'lucide-react';
import {
  AuthType,
  Permissions,
  ArtifactModes,
  PermissionTypes,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { useLocalize, useHasAccess, useHasMemoryAccess, useAgentCapabilities } from '~/hooks';
import { useToolsDropdownConfig } from '~/hooks/Plugins/useToolsDropdownConfig';
import useArtifactsShadcnOnly from '~/hooks/Artifacts/useArtifactsShadcnOnly';
import ArtifactsSubMenu from '~/components/Chat/Input/ArtifactsSubMenu';
import ToolStateControl from '~/components/Chat/Input/ToolStateControl';
import MCPSubMenu from '~/components/Chat/Input/MCPSubMenu';
import { useGetStartupConfig } from '~/data-provider';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

interface ToolsDropdownProps {
  disabled?: boolean;
}

/** Ariakit portals to document.body by default, which puts the menu outside every landmark.
 *  Returning null falls back to that default. */
const getMainLandmark = () => document.querySelector<HTMLElement>('main');

const ToolsDropdown = ({ disabled }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  // Deloitte Custom Change: admin-configured rows (`toolsDropdown.items`).
  const { isItemVisible, showPinButtons } = useToolsDropdownConfig();
  const { data: startupConfig } = useGetStartupConfig();

  const {
    codeEnabled,
    memoryEnabled,
    webSearchEnabled,
    artifactsEnabled,
    fileSearchEnabled,
    skillsEnabled,
  } = useAgentCapabilities(context?.agentsConfig?.capabilities ?? defaultAgentCapabilities);

  /** Deloitte Custom Change: limits Artifacts to shadcn/ui mode when enabled. */
  const shadcnOnly = useArtifactsShadcnOnly();

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  const canUseFileSearch = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });

  const canUseMcp = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });

  const canUseSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });

  const canUseMemory = useHasMemoryAccess();
  // Deloitte Custom Change: keep the row present when the user has opted out so it mirrors the
  // sidebar switch and can be used to opt back in.
  const showMemory = canUseMemory && memoryEnabled;

  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const isDisabled = disabled ?? false;
  const {
    skills,
    memory,
    webSearch,
    artifacts,
    fileSearch,
    mcpServerManager,
    codeInterpreter,
    searchApiKeyForm,
  } = context ?? {};

  const { setIsDialogOpen: setIsSearchDialogOpen, menuTriggerRef: searchMenuTriggerRef } =
    searchApiKeyForm ?? {};
  const {
    isPinned: isSearchPinned,
    setIsPinned: setIsSearchPinned,
    authData: webSearchAuthData,
  } = webSearch ?? {};
  const { isPinned: isCodePinned, setIsPinned: setIsCodePinned } = codeInterpreter ?? {};
  const { isPinned: isFileSearchPinned, setIsPinned: setIsFileSearchPinned } = fileSearch ?? {};
  const { isPinned: isArtifactsPinned, setIsPinned: setIsArtifactsPinned } = artifacts ?? {};
  const { isPinned: isSkillsPinned, setIsPinned: setIsSkillsPinned } = skills ?? {};
  const { isPinned: isMemoryPinned, setIsPinned: setIsMemoryPinned } = memory ?? {};

  const showWebSearchSettings = useMemo(() => {
    const authTypes = webSearchAuthData?.authTypes ?? [];
    if (authTypes.length === 0) return true;
    return !authTypes.every(([, authType]) => authType === AuthType.SYSTEM_DEFINED);
  }, [webSearchAuthData?.authTypes]);

  const handleWebSearchToggle = useCallback(() => {
    const newValue = !webSearch?.toggleState;
    webSearch?.debouncedChange({ value: newValue });
  }, [webSearch]);

  const handleCodeInterpreterToggle = useCallback(() => {
    const newValue = !codeInterpreter?.toggleState;
    codeInterpreter?.debouncedChange({ value: newValue });
  }, [codeInterpreter]);

  const handleFileSearchToggle = useCallback(() => {
    const newValue = !fileSearch?.toggleState;
    fileSearch?.debouncedChange({ value: newValue });
  }, [fileSearch]);

  const handleArtifactsToggle = useCallback(() => {
    const currentState = artifacts?.toggleState;
    if (!currentState || currentState === '') {
      artifacts?.debouncedChange({
        value: shadcnOnly ? ArtifactModes.SHADCNUI : ArtifactModes.DEFAULT,
      });
    } else {
      artifacts?.debouncedChange({ value: '' });
    }
  }, [artifacts, shadcnOnly]);

  const handleShadcnToggle = useCallback(() => {
    const currentState = artifacts?.toggleState;
    if (currentState === ArtifactModes.SHADCNUI) {
      artifacts?.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts?.debouncedChange({ value: ArtifactModes.SHADCNUI });
    }
  }, [artifacts]);

  const handleCustomToggle = useCallback(() => {
    const currentState = artifacts?.toggleState;
    if (currentState === ArtifactModes.CUSTOM) {
      artifacts?.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts?.debouncedChange({ value: ArtifactModes.CUSTOM });
    }
  }, [artifacts]);

  const handleSkillsToggle = useCallback(() => {
    const newValue = !skills?.toggleState;
    skills?.debouncedChange({ value: newValue });
  }, [skills]);

  const handleMemoryToggle = useCallback(() => {
    const newValue = !memory?.toggleState;
    memory?.debouncedChange({ value: newValue });
  }, [memory]);

  const mcpPlaceholder = startupConfig?.interface?.mcpServers?.placeholder;

  const dropdownItems: MenuItemProps[] = [];
  // Deloitte Custom Change: each row below renders only if listed in `toolsDropdown.items`.

  if (fileSearchEnabled && canUseFileSearch && isItemVisible('file_search')) {
    dropdownItems.push({
      onClick: handleFileSearchToggle,
      hideOnClick: false,
      // Deloitte Custom Change: expose the on/off state on the focusable row when pin buttons are hidden.
      ariaChecked: showPinButtons ? undefined : Boolean(fileSearch?.toggleState),
      render: (props) => (
        <div {...props} data-testid="tools-menu-file-search">
          <div className="flex items-center gap-2">
            <VectorIcon className="icon-md" />
            <span>{localize('com_assistants_file_search')}</span>
          </div>
          <ToolStateControl
            isPinned={isFileSearchPinned}
            setIsPinned={setIsFileSearchPinned}
            checked={Boolean(fileSearch?.toggleState)}
          />
        </div>
      ),
    });
  }

  if (canUseWebSearch && webSearchEnabled && isItemVisible('web_search')) {
    dropdownItems.push({
      onClick: handleWebSearchToggle,
      hideOnClick: false,
      // Deloitte Custom Change: expose the on/off state on the focusable row when pin buttons are hidden.
      ariaChecked: showPinButtons ? undefined : Boolean(webSearch?.toggleState),
      render: (props) => (
        <div {...props}>
          <div className="flex items-center gap-2">
            <Globe className="icon-md" aria-hidden="true" />
            <span>{localize('com_ui_web_search')}</span>
          </div>
          <div className="flex items-center gap-1">
            {showWebSearchSettings && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSearchDialogOpen?.(true);
                }}
                className={cn(
                  'rounded p-1 transition-all duration-200',
                  'hover:bg-surface-secondary hover:shadow-sm',
                  'text-text-secondary hover:text-text-primary',
                )}
                aria-label="Configure web search"
                ref={searchMenuTriggerRef}
              >
                <div className="h-4 w-4">
                  <Settings className="h-4 w-4" aria-hidden="true" />
                </div>
              </button>
            )}
            <ToolStateControl
              isPinned={isSearchPinned}
              setIsPinned={setIsSearchPinned}
              checked={Boolean(webSearch?.toggleState)}
            />
          </div>
        </div>
      ),
    });
  }

  if (canUseSkills && skillsEnabled && isItemVisible('skills')) {
    dropdownItems.push({
      onClick: handleSkillsToggle,
      hideOnClick: false,
      // Deloitte Custom Change: expose the on/off state on the focusable row when pin buttons are hidden.
      ariaChecked: showPinButtons ? undefined : Boolean(skills?.toggleState),
      render: (props) => (
        <div {...props} data-testid="tools-menu-skills">
          <div className="flex items-center gap-2">
            <ScrollText className="icon-md" aria-hidden="true" />
            <span>{localize('com_ui_skills')}</span>
          </div>
          <ToolStateControl
            isPinned={isSkillsPinned}
            setIsPinned={setIsSkillsPinned}
            checked={Boolean(skills?.toggleState)}
          />
        </div>
      ),
    });
  }

  if (showMemory && isItemVisible('memory')) {
    dropdownItems.push({
      onClick: handleMemoryToggle,
      hideOnClick: false,
      // Deloitte Custom Change: expose the on/off state on the focusable row when pin buttons are hidden.
      ariaChecked: showPinButtons ? undefined : Boolean(memory?.toggleState),
      render: (props) => (
        <div {...props} data-testid="tools-menu-memory">
          <div className="flex items-center gap-2">
            <Brain className="icon-md" aria-hidden="true" />
            <span>{localize('com_ui_memory')}</span>
          </div>
          <ToolStateControl
            isPinned={isMemoryPinned}
            setIsPinned={setIsMemoryPinned}
            checked={Boolean(memory?.toggleState)}
          />
        </div>
      ),
    });
  }

  if (canRunCode && codeEnabled && isItemVisible('execute_code')) {
    dropdownItems.push({
      onClick: handleCodeInterpreterToggle,
      hideOnClick: false,
      // Deloitte Custom Change: expose the on/off state on the focusable row when pin buttons are hidden.
      ariaChecked: showPinButtons ? undefined : Boolean(codeInterpreter?.toggleState),
      render: (props) => (
        <div {...props} data-testid="tools-menu-run-code">
          <div className="flex items-center gap-2">
            <TerminalSquareIcon className="icon-md" aria-hidden="true" />
            <span>{localize('com_ui_run_code')}</span>
          </div>
          <div className="flex items-center gap-1">
            <ToolStateControl
              isPinned={isCodePinned}
              setIsPinned={setIsCodePinned}
              checked={Boolean(codeInterpreter?.toggleState)}
            />
          </div>
        </div>
      ),
    });
  }

  if (artifactsEnabled && setIsArtifactsPinned != null && isItemVisible('artifacts')) {
    dropdownItems.push({
      hideOnClick: false,
      render: (props) => (
        <ArtifactsSubMenu
          {...props}
          // Deloitte Custom Change: expose the on/off state on the focusable trigger when pin buttons are hidden.
          {...(!showPinButtons && {
            role: 'menuitemcheckbox',
            'aria-checked':
              typeof artifacts?.toggleState === 'string' && artifacts.toggleState.length > 0,
          })}
          isArtifactsPinned={isArtifactsPinned ?? false}
          setIsArtifactsPinned={setIsArtifactsPinned}
          artifactsMode={artifacts?.toggleState as string}
          handleArtifactsToggle={handleArtifactsToggle}
          handleShadcnToggle={handleShadcnToggle}
          handleCustomToggle={handleCustomToggle}
          shadcnOnly={shadcnOnly}
        />
      ),
    });
  }

  const { availableMCPServers } = mcpServerManager ?? {};
  if (canUseMcp && availableMCPServers && availableMCPServers.length > 0 && isItemVisible('mcp')) {
    dropdownItems.push({
      hideOnClick: false,
      render: (props) => <MCPSubMenu {...props} placeholder={mcpPlaceholder} />,
    });
  }

  if (dropdownItems.length === 0) {
    return null;
  }

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isDisabled}
          id="tools-dropdown-button"
          aria-label="Tools Options"
          className={cn(
            'flex size-theme-control items-center justify-center rounded-theme-control-round p-1 transition-colors duration-theme-fast hover:bg-surface-composer-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-opacity-50',
            isPopoverActive && 'bg-surface-composer-hover',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <Settings2 className="size-5" aria-hidden="true" />
          </div>
        </Ariakit.MenuButton>
      }
      id="tools-dropdown-button"
      description={localize('com_ui_tools')}
      disabled={isDisabled}
    />
  );

  return (
    <DropdownPopup
      itemClassName="flex w-full cursor-pointer rounded-lg items-center justify-between hover:bg-surface-hover gap-5"
      menuId="tools-dropdown-menu"
      isOpen={isPopoverActive}
      setIsOpen={setIsPopoverActive}
      modal={false}
      portal={true}
      portalElement={getMainLandmark}
      preserveTabOrder={false}
      unmountOnHide={true}
      trigger={menuTrigger}
      items={dropdownItems}
      iconClassName="mr-0"
    />
  );
};

export default React.memo(ToolsDropdown);
