import { Card, CardContent, CardHeader, CardTitle, GEL } from '@librechat/client';
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
    <Card className={cn('relative gap-2 transition-shadow hover:shadow-md')}>
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
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{description}</CardContent>
    </Card>
  );
}
