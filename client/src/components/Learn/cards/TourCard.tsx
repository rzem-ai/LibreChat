import { Button, GEL } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { TourStatus } from '../content/schema';
import { ModuleStatus } from './ModuleStatus';
import { cn } from '~/utils';

interface TourCardProps {
  title: string;
  description: string;
  status: TourStatus;
  /** Completion percentage, used by the progress ring while in progress. */
  percent?: number;
  statusLabel: string;
  ctaLabel: string;
  onStart: () => void;
  /** `wide` is the single-row Getting Started layout; `compact` is the grid card. */
  variant?: 'compact' | 'wide';
  disabled?: boolean;
}

export function TourCard({
  title,
  description,
  status,
  percent = 0,
  statusLabel,
  ctaLabel,
  onStart,
  variant = 'compact',
  disabled = false,
}: TourCardProps): JSX.Element {
  const cta = (
    <Button
      type="button"
      size="sm"
      variant={status === 'complete' ? 'outline' : 'submit'}
      disabled={disabled}
      onClick={onStart}
    >
      {ctaLabel}
    </Button>
  );

  if (variant === 'wide') {
    return (
      <GEL.Card className="flex-col items-start gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <GEL.CardTitle className="text-base font-[550] leading-none">{title}</GEL.CardTitle>
          <p className="max-w-prose text-sm text-text-secondary">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <ModuleStatus status={status} percent={percent} label={statusLabel} showLabel />
          {cta}
        </div>
      </GEL.Card>
    );
  }

  return (
    <GEL.Card className={cn('@container', disabled && 'opacity-60')}>
      <GEL.CardHeader className="items-start">
        <GEL.CardTitle className="min-w-0 flex-1 text-base font-[550] leading-none">
          {title}
        </GEL.CardTitle>
        <ModuleStatus
          status={status}
          percent={percent}
          label={statusLabel}
          showLabel={false}
          adaptive
        />
      </GEL.CardHeader>
      <GEL.CardContent className="max-w-prose">{description}</GEL.CardContent>
      <GEL.CardFooter>{cta}</GEL.CardFooter>
    </GEL.Card>
  );
}
