import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { slugify } from '../../../content/headings';
import { useLocalize } from '~/hooks';
import { ArticleLink } from './link';

interface TermsProps {
  children: ReactNode;
}

interface TermProps {
  name: string;
  href?: string;
  children: ReactNode;
}

export function Terms({ children }: TermsProps): JSX.Element {
  return <dl className="mt-6 flex flex-col gap-6">{children}</dl>;
}

export function Term({ name, href, children }: TermProps): JSX.Element {
  const localize = useLocalize();

  return (
    <div id={slugify(name)} className="scroll-mt-6">
      <dt className="text-base font-medium">{name}</dt>
      <dd className="mt-1 text-text-secondary">
        {children}
        {href && (
          <>
            {' '}
            <ArticleLink href={href}>{localize('com_learning_read_the_guide')}</ArticleLink>
          </>
        )}
      </dd>
    </div>
  );
}
