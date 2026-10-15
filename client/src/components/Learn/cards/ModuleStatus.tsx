import type { JSX } from 'react/jsx-runtime';
import type { TourStatus } from '../content/schema';
import { cn } from '~/utils';

const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ percent }: { percent: number }): JSX.Element {
  return (
    <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 20 20">
      <circle
        className="stroke-border-light"
        cx={10}
        cy={10}
        fill="none"
        r={RING_RADIUS}
        strokeWidth={2.5}
      />
      <circle
        className="origin-center -rotate-90 stroke-primary"
        cx={10}
        cy={10}
        fill="none"
        r={RING_RADIUS}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
        strokeLinecap="round"
        strokeWidth={2.5}
      />
    </svg>
  );
}

function FilledCheck(): JSX.Element {
  return (
    <svg aria-hidden="true" className="size-[18px] shrink-0 text-primary" viewBox="0 0 24 24">
      <circle cx={12} cy={12} fill="currentColor" r={10} />
      <path
        className="stroke-surface-primary"
        d="M7.5 12.5l3 3 6-6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.25}
      />
    </svg>
  );
}

interface ModuleStatusProps {
  status: TourStatus;
  percent: number;
  /** Already-localized text, e.g. "Completed" or "60% complete". */
  label: string;
  /** Wide layouts always spell the status out; compact layouts show the icon alone. */
  showLabel: boolean;
  /** Shows the label only once the enclosing card container is wider than one grid column. */
  adaptive?: boolean;
}

export function ModuleStatus({
  status,
  percent,
  label,
  showLabel,
  adaptive = false,
}: ModuleStatusProps): JSX.Element | null {
  if (status === 'not-started' && !showLabel && !adaptive) {
    return null;
  }

  return (
    <span
      role="img"
      aria-label={label}
      className="flex shrink-0 items-center gap-2 text-sm text-text-secondary"
    >
      {status === 'complete' && <FilledCheck />}
      {status === 'in-progress' && <ProgressRing percent={percent} />}
      {(showLabel || adaptive) && (
        <span className={cn(adaptive && 'hidden @[28rem]:inline')}>{label}</span>
      )}
    </span>
  );
}
