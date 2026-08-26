import { memo } from 'react';
import { cn } from '~/utils';

interface SkillToggleProps {
  enabled: boolean;
  onChange: () => void;
  ariaLabel: string;
  /** Visible label next to the switch (e.g. "Active"/"Disabled"); hidden from assistive tech since `aria-label` already covers it. */
  label: string;
}

function SkillToggle({ enabled, onChange, ariaLabel, label }: SkillToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-1 transition-colors hover:bg-surface-hover"
    >
      <span className="text-xs font-medium text-text-secondary" aria-hidden="true">
        {label}
      </span>
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          enabled ? 'bg-surface-submit' : 'bg-border-medium',
        )}
      >
        <span
          className={cn(
            'pointer-events-none mt-0.5 inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            enabled ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

export default memo(SkillToggle);
