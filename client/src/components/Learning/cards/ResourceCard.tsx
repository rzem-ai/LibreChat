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
  onSelect,
}: ResourceCardProps): JSX.Element {
  const Icon = GEL.Icon[icon];

  return (
    <GEL.Card
      className={cn(
        '[--border-accent:oklch(0.33 0 0)] dark:[--border-accent:oklch(0.33 0 0)]',
        'relative gap-2 transition-all hover:border-[color:var(--border-accent)] hover:shadow-sm',
      )}
    >
      {externalHref ? (
        <a
          href={externalHref}
          target="_blank"
          rel="noopener noreferrer"
          className={overlayClass}
          aria-label={actionLabel}
        />
      ) : (
        <button
          type="button"
          className={overlayClass}
          aria-label={actionLabel}
          onClick={onSelect}
        />
      )}
      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Icon className="size-4" aria-hidden="true" />
        {metaLabel}
      </div>
      <GEL.CardHeader>
        <GEL.CardTitle>{title}</GEL.CardTitle>
      </GEL.CardHeader>
      <GEL.CardContent>{description}</GEL.CardContent>
    </GEL.Card>
  );
}
