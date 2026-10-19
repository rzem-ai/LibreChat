import React, { memo } from 'react';
import { TerminalSquareIcon } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useToolsDropdownConfig } from '~/hooks/Plugins/useToolsDropdownConfig';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function CodeInterpreter() {
  const localize = useLocalize();
  // Deloitte Custom Change: hide the pill when the tools dropdown is this tool's only control.
  const { isDropdownOnly } = useToolsDropdownConfig();
  const context = useBadgeRowContext();
  const { toggleState: runCode, debouncedChange, isPinned } = context?.codeInterpreter ?? {};

  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  if (!canRunCode) {
    return null;
  }

  return (
    (isPinned || (runCode && !isDropdownOnly('execute_code'))) && (
      <CheckboxButton
        checked={runCode}
        setValue={debouncedChange}
        id="toolbar-toggle-code-interpreter"
        label={localize('com_ui_run_code')}
        isCheckedClassName={badgeAccents.purple}
        icon={<TerminalSquareIcon className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(CodeInterpreter);
