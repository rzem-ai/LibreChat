import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import type { ComponentProps } from 'react';
import { cn } from '~/utils';

interface ArticleLinkProps extends Omit<ComponentProps<'a'>, 'ref'> {
  /** Skips the inline link styling and the external icon, for links that style themselves (cards). */
  bare?: boolean;
}

export const isInternalHref = (href: string): boolean =>
  href.startsWith('/') && !href.startsWith('//');

export const isExternalHref = (href: string): boolean =>
  href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href);

/** `!` beats the `text-link` colour the shared Typeset sets on every descendant anchor. */
const linkClass =
  '!text-text-primary underline decoration-text-tertiary underline-offset-4 transition-colors hover:!text-accent-primary hover:decoration-accent-primary';

export function ArticleLink({
  href = '',
  children,
  className,
  bare = false,
  ...props
}: ArticleLinkProps): JSX.Element {
  const classes = bare ? className : cn(linkClass, className);

  if (isInternalHref(href)) {
    return (
      <Link to={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }
  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...props}>
        {children}
        {!bare && (
          <ArrowUpRight className="ml-0.5 inline size-3.5 align-text-top" aria-hidden="true" />
        )}
      </a>
    );
  }
  return (
    <a href={href} className={classes} {...props}>
      {children}
    </a>
  );
}
