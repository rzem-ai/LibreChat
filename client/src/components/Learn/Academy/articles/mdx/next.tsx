import { ArrowRight } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { useLocalize } from '~/hooks';
import { ArticleLink } from './link';

interface NextArticleProps {
  href: string;
  title: string;
  children?: ReactNode;
}

/** Full-width hand-off to the next article, visually distinct from the grid cards. */
export function NextArticle({ href, title, children }: NextArticleProps): JSX.Element {
  const localize = useLocalize();

  return (
    <ArticleLink
      bare
      href={href}
      className="group mt-12 flex items-center justify-between gap-6 rounded-xl border border-border-light bg-surface-primary px-6 py-5 !text-text-primary !no-underline transition-colors hover:border-border-heavy focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
    >
      <span className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">{localize('com_learning_next_article')}</span>
        <span className="text-lg font-medium">{title}</span>
        {children && <span className="text-sm text-text-secondary">{children}</span>}
      </span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-light transition-colors group-hover:border-surface-submit group-hover:bg-surface-submit group-hover:text-text-on-status">
        <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </ArticleLink>
  );
}
