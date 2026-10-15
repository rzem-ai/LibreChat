import React from 'react';
import { Check } from 'lucide-react';
import { PinIcon } from '@librechat/client';
import { useToolsDropdownConfig } from '~/hooks/Plugins/useToolsDropdownConfig';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ToolStateControlProps {
  label: string;
  isPinned?: boolean;
  setIsPinned?: (value: boolean) => void;
  /** On/off state shown as a checkbox when pin buttons are hidden. Omit for rows with no single state. */
  checked?: boolean;
}

/** Deloitte Custom Change: trailing control of a tools-dropdown row: a pin button, or an on/off checkbox when pinning is admin-controlled. */
const ToolStateControl = ({ label, isPinned, setIsPinned, checked }: ToolStateControlProps) => {
  const localize = useLocalize();
  const { showPinButtons } = useToolsDropdownConfig();

  if (!showPinButtons) {
    return checked == null ? null : (
      <span
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        className={cn(
          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border',
          checked
            ? 'border-border-xheavy bg-surface-submit text-text-on-status'
            : 'border-border-xheavy bg-transparent',
        )}
      >
        {checked && <Check className="h-4 w-4" aria-hidden="true" />}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsPinned?.(!isPinned);
      }}
      className={cn(
        'rounded p-1 transition-all duration-200',
        'hover:bg-surface-secondary hover:shadow-sm',
        !isPinned && 'text-text-secondary hover:text-text-primary',
      )}
      aria-label={isPinned ? localize('com_ui_unpin') : localize('com_ui_pin')}
    >
      <div className="h-4 w-4">
        <PinIcon unpin={isPinned} />
      </div>
    </button>
  );
};

export default React.memo(ToolStateControl);
