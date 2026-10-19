import { cn } from '~/utils';

const SIZE = 20;
const STROKE_WIDTH = 2.5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface GaugeProps {
  /** 0–100, clamped by the caller */
  percent: number;
  /** Max context unknown — render an empty track only */
  indeterminate: boolean;
}

// Deloitte Custom Change: warning/error thresholds are exported so the balance gauge text matches the ring colour
export type GaugeTone = 'neutral' | 'warning' | 'error';

export function getGaugeTone(percent: number, indeterminate: boolean): GaugeTone {
  if (indeterminate) {
    return 'neutral';
  }
  if (percent > 90) {
    return 'error';
  }
  if (percent > 75) {
    return 'warning';
  }
  return 'neutral';
}

const STROKE_CLASSES: Record<GaugeTone, string> = {
  neutral: 'stroke-text-secondary',
  warning: 'stroke-status-warning',
  error: 'stroke-status-error',
};

export default function Gauge({ percent, indeterminate }: GaugeProps) {
  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="-rotate-90"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="transparent"
        strokeWidth={STROKE_WIDTH}
        className="stroke-border-heavy"
        strokeDasharray={indeterminate ? '2 4' : undefined}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="transparent"
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={indeterminate ? CIRCUMFERENCE : offset}
        strokeLinecap="round"
        className={cn(
          'transition-all duration-300',
          STROKE_CLASSES[getGaugeTone(percent, indeterminate)],
        )}
      />
    </svg>
  );
}
