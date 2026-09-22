// Deloitte Custom Change: badge pill toggling provider-native web search
import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';

/** Unlike the other badge pills, this one has no role-permission check — native search is
 *  treated as a plain model capability, gated only by admin `nativeWebSearch.supportedModels`.
 *  Revisit if native search needs per-role control (data egress to the provider, per-call cost). */
function NativeWebSearch() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  if (!context) {
    return null;
  }
  const { nativeWebSearch } = context;
  const { toggleState, debouncedChange, isPinned, isSupported } = nativeWebSearch;
  /** Hard gate: a pinned-but-unsupported toggle would just error on submit. */
  if (!isSupported) {
    return null;
  }

  return (
    (isPinned || toggleState) && (
      <CheckboxButton
        className="max-w-fit"
        checked={toggleState}
        setValue={debouncedChange}
        label={localize('com_ui_native_web_search')}
        isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
        icon={<Globe className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(NativeWebSearch);
