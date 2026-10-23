import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { slugify } from '../../../content/headings';
import { ArticleLink } from './link';

interface TermsProps {
  children: ReactNode;
}

interface TermProps {
  name: string;
  /** Links the term name to the guide that covers it. */
  href?: string;
  children: ReactNode;
}

export function Terms({ children }: TermsProps): JSX.Element {
  return (
    <dl className="mt-6 divide-y divide-border-light border-y border-border-light">{children}</dl>
  );
}

export function Term({ name, href, children }: TermProps): JSX.Element {
  return (
    <div
      id={slugify(name)}
      className="grid scroll-mt-6 gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-8"
    >
      <dt className="font-medium">{href ? <ArticleLink href={href}>{name}</ArticleLink> : name}</dt>
      <dd className="text-text-secondary">{children}</dd>
    </div>
  );
}
