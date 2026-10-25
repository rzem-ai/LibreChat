import { ArrowUpRight } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { ArticleLink, isExternalHref } from './link';

interface CardGridProps {
  children: ReactNode;
}

interface CardProps {
  href: string;
  title: string;
  children?: ReactNode;
}

export function CardGrid({ children }: CardGridProps): JSX.Element {
  return <div className="mt-6 grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** Write the description on the same line as the tags so MDX renders it inline, not as a paragraph. */
export function Card({ href, title, children }: CardProps): JSX.Element {
  return (
    <ArticleLink
      bare
      href={href}
      className="flex h-full flex-col gap-1 rounded-xl border border-border-light bg-surface-chat p-5 !text-text-primary !no-underline transition-colors hover:border-border-heavy focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
    >
      <span className="flex items-center justify-between gap-2 text-base font-medium">
        {title}
        {isExternalHref(href) && (
          <ArrowUpRight className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        )}
      </span>
      {children && <span className="text-sm text-text-secondary">{children}</span>}
    </ArticleLink>
  );
}
