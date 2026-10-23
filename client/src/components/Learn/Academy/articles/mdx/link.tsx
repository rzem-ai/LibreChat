import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { JSX } from 'react/jsx-runtime';
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
  '!text-text-primary underline decoration-text-tertiary underline-offset-4 transition-colors hover:!text-surface-submit hover:decoration-surface-submit';

/** Keeps the icon on the same line as the last word, so it never wraps away on its own. */
function WithExternalIcon({ children }: { children: ReactNode }): JSX.Element {
  const icon = <ArrowUpRight className="ml-px inline size-3.5 align-text-top" aria-hidden="true" />;
  if (typeof children !== 'string') {
    return (
      <>
        {children}
        {icon}
      </>
    );
  }
  const split = children.lastIndexOf(' ');
  return (
    <>
      {children.slice(0, split + 1)}
      <span className="whitespace-nowrap">
        {children.slice(split + 1)}
        {icon}
      </span>
    </>
  );
}

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
        {bare ? children : <WithExternalIcon>{children}</WithExternalIcon>}
      </a>
    );
  }
  return (
    <a href={href} className={classes} {...props}>
      {children}
    </a>
  );
}
