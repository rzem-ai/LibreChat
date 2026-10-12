import React, { memo } from 'react';
import { CheckboxButton, VectorIcon } from '@librechat/client';
import { useGetStartupConfig } from '~/data-provider';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';

// Deloitte Custom Change: enable fileSearch without showing button
function FileSearch() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { toggleState: fileSearchEnabled, debouncedChange, isPinned } = context?.fileSearch ?? {};
  const hideFileSearchToggle =
    startupConfig?.interface?.customDeloitteFeatureFlags?.hideFileSearchToggle === true;

  if (!context?.canUseFileSearchPill || hideFileSearchToggle) {
    return null;
  }

  return (
    <>
      {(fileSearchEnabled || isPinned) && (
        <CheckboxButton
          checked={fileSearchEnabled}
          setValue={debouncedChange}
          id="toolbar-toggle-file-search"
          label={localize('com_assistants_file_search')}
          // Deloitte Custom Change (PR #138, GEL design system): branded checked-state color
          // instead of upstream's generic badgeAccents.green token.
          isCheckedClassName="border-green-600/40 bg-surface-submit/10 hover:bg-surface-submit-hover/10"
          icon={<VectorIcon className="icon-md" />}
        />
      )}
    </>
  );
}

export default memo(FileSearch);
