import type React from 'react';
import { cn } from '~/utils';

export interface RatingMeterProps {
  value: number;
  max?: number;
  className?: string;
}

// Deloitte Custom Change: new file — discrete N-of-max step indicator for the model info
// tooltip (Figma node 855:37722); distinct from SegmentedMeter's proportional category bar.
export function RatingMeter({ value, max = 5, className }: RatingMeterProps): React.ReactElement {
  return (
    <div
      className={cn('flex flex-1 items-center gap-2', className)}
      role="img"
      aria-label={`${value} of ${max}`}
    >
      {Array.from({ length: max }, (_, index) => (
        <div
          key={index}
          className={cn(
            'h-1 flex-1 rounded-full',
            index < value ? 'bg-surface-submit' : 'bg-border-light',
          )}
        />
      ))}
    </div>
  );
}
