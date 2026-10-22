import { Link } from 'react-router-dom';
import type { JSX } from 'react/jsx-runtime';
import type { ComponentProps } from 'react';

type AnchorProps = Omit<ComponentProps<'a'>, 'ref'>;

export const isInternalHref = (href: string): boolean =>
  href.startsWith('/') && !href.startsWith('//');

export const isExternalHref = (href: string): boolean =>
  href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href);

export function ArticleLink({ href = '', children, ...props }: AnchorProps): JSX.Element {
  if (isInternalHref(href)) {
    return (
      <Link to={href} {...props}>
        {children}
      </Link>
    );
  }
  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
