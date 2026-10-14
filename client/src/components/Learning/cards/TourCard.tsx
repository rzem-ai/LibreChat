import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  GEL,
} from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { TourStatus } from '../content/schema';
import { StatusChip } from './StatusChip';
import { cn } from '~/utils';

interface TourCardProps {
  title: string;
  description: string;
  status: TourStatus;
  statusLabel: string;
  ctaLabel: string;
  onStart: () => void;
  /** Full-width horizontal layout used for the Getting Started tour. */
  hero?: boolean;
  disabled?: boolean;
}

export function TourCard({
  title,
  description,
  status,
  statusLabel,
  ctaLabel,
  onStart,
  hero = false,
  disabled = false,
}: TourCardProps): JSX.Element {
  const StatusIcon = status === 'complete' ? GEL.Icon.Complete : GEL.Icon.Incomplete;
  const statusIconClass = status === 'in-progress' ? 'text-primary' : 'text-text-secondary';
  const cta = (
    <Button
      type="button"
      size={hero ? 'default' : 'sm'}
      variant={status === 'in-progress' ? 'submit' : 'outline'}
      disabled={disabled}
      onClick={onStart}
    >
      {ctaLabel}
    </Button>
  );
  const chip = <StatusChip status={status} label={statusLabel} />;

  if (hero) {
    return (
      <Card className="flex-col items-start gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-center gap-3">
          <StatusIcon className={cn('size-5 shrink-0', statusIconClass)} aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="text-sm text-text-secondary">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {chip}
          {cta}
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn(disabled && 'opacity-60')}>
      <CardHeader>
        <CardTitle>
          <StatusIcon className={cn('size-4 shrink-0', statusIconClass)} aria-hidden="true" />
          {title}
        </CardTitle>
        {chip}
      </CardHeader>
      <CardContent>{description}</CardContent>
      <CardFooter>{cta}</CardFooter>
    </Card>
  );
}
