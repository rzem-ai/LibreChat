import React, { memo } from 'react';
import { ScrollText } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes, defaultAgentCapabilities } from 'librechat-data-provider';
import { useToolsDropdownConfig } from '~/hooks/Plugins/useToolsDropdownConfig';
import { useLocalize, useHasAccess, useAgentCapabilities } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function Skills() {
  const localize = useLocalize();
  // Deloitte Custom Change: hide the pill when the tools dropdown is this tool's only control.
  const { isDropdownOnly } = useToolsDropdownConfig();
  const context = useBadgeRowContext();
  const { toggleState: skillsActive, debouncedChange, isPinned } = context?.skills ?? {};

  const canUseSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });

  const { skillsEnabled } = useAgentCapabilities(
    context?.agentsConfig?.capabilities ?? defaultAgentCapabilities,
  );

  if (!canUseSkills || !skillsEnabled) {
    return null;
  }

  return (
    (isPinned || (skillsActive && !isDropdownOnly('skills'))) && (
      <CheckboxButton
        checked={skillsActive}
        setValue={debouncedChange}
        id="toolbar-toggle-skills"
        label={localize('com_ui_skills')}
        isCheckedClassName={badgeAccents.cyan}
        icon={<ScrollText className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(Skills);
