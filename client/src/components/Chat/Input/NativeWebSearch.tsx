// Deloitte Custom Change: badge pill toggling provider-native web search
import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { CheckboxButton, PinIcon } from '@librechat/client';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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
  const { toggleState, debouncedChange, isPinned, setIsPinned, isSupported } = nativeWebSearch;
  /** Hard gate: a pinned-but-unsupported toggle would just error on submit. */
  if (!isSupported) {
    return null;
  }

  return (
    (isPinned || toggleState) && (
      <div className="flex items-center gap-2">
        <CheckboxButton
          className="max-w-fit"
          checked={toggleState}
          setValue={debouncedChange}
          label={localize('com_ui_native_web_search')}
          isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
          icon={<Globe className="icon-md" aria-hidden="true" />}
        />
        <button
          type="button"
          onClick={() => setIsPinned(!isPinned)}
          aria-pressed={isPinned}
          className={cn(
            'flex size-9 items-center justify-center rounded-full border border-border-medium bg-transparent p-2 shadow-sm transition-all',
            'hover:bg-surface-hover hover:shadow-md active:shadow-inner',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            !isPinned && 'text-text-secondary hover:text-text-primary',
          )}
          aria-label={isPinned ? localize('com_ui_unpin') : localize('com_ui_pin')}
        >
          <PinIcon unpin={isPinned} />
        </button>
      </div>
    )
  );
}

export default memo(NativeWebSearch);
