import React, { memo } from 'react';
import { Brain } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { defaultAgentCapabilities } from 'librechat-data-provider';
import { useLocalize, useHasMemoryAccess, useAgentCapabilities } from '~/hooks';
import { useToolsDropdownConfig } from '~/hooks/Plugins/useToolsDropdownConfig';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function Memory() {
  const localize = useLocalize();
  // Deloitte Custom Change: hide the pill when the tools dropdown is this tool's only control.
  const { isDropdownOnly } = useToolsDropdownConfig();
  const context = useBadgeRowContext();
  const { toggleState: memoryActive, debouncedChange, isPinned } = context?.memory ?? {};

  const canUseMemory = useHasMemoryAccess();

  const { memoryEnabled } = useAgentCapabilities(
    context?.agentsConfig?.capabilities ?? defaultAgentCapabilities,
  );

  if (!canUseMemory || !memoryEnabled) {
    return null;
  }

  return (
    (isPinned || (memoryActive && !isDropdownOnly('memory'))) && (
      <CheckboxButton
        checked={memoryActive}
        setValue={debouncedChange}
        id="toolbar-toggle-memory"
        label={localize('com_ui_memory')}
        isCheckedClassName={badgeAccents.purple}
        icon={<Brain className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(Memory);
