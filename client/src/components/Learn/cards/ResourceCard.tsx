import { Link } from 'react-router-dom';
import { GEL } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import { cn } from '~/utils';

interface ResourceCardProps {
  title: string;
  description: string;
  icon: GEL.IconName;
  /** Already-localized meta text, e.g. "Article · 6 min read". */
  metaLabel: string;
  /** Accessible name for the stretched click target. */
  actionLabel: string;
  /** Opens in a new tab with `rel="noopener noreferrer"`; otherwise `onSelect` runs on click. */
  externalHref?: string;
  /** In-app route rendered as a router link, so it supports open in new tab. */
  to?: string;
  onSelect?: () => void;
}

const overlayClass =
  'absolute inset-0 rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy';

export function ResourceCard({
  title,
  description,
  icon,
  metaLabel,
  actionLabel,
  externalHref,
  to,
  onSelect,
}: ResourceCardProps): JSX.Element {
  const renderOverlay = (): JSX.Element => {
    if (externalHref) {
      return (
        <a
          href={externalHref}
          target="_blank"
          rel="noopener noreferrer"
          className={overlayClass}
          aria-label={actionLabel}
        />
      );
    }
    if (to) {
      return <Link to={to} className={overlayClass} aria-label={actionLabel} />;
    }
    return (
      <button type="button" className={overlayClass} aria-label={actionLabel} onClick={onSelect} />
    );
  };

  return (
    <GEL.Card
      className={cn(
        '[--border-accent:oklch(0.75_0_0)] dark:[--border-accent:oklch(0.55_0_0)]',
        'relative gap-2 transition-all hover:border-[color:var(--border-accent)] hover:shadow-sm',
      )}
    >
      {renderOverlay()}
      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
        <GEL.Icon name={icon} className="size-4" aria-hidden="true" />
        {metaLabel}
      </div>
      <GEL.CardHeader>
        <GEL.CardTitle>{title}</GEL.CardTitle>
      </GEL.CardHeader>
      <GEL.CardContent>{description}</GEL.CardContent>
    </GEL.Card>
  );
}
