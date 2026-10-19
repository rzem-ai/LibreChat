import type { JSX } from 'react/jsx-runtime';
import type { HTMLAttributes } from 'react';
import { cn } from '~/utils';

/** Sticky bar for the top of a scrolling page; compose controls, titles and actions as children. */
export function Header({ className, ...props }: HTMLAttributes<HTMLElement>): JSX.Element {
  return (
    <header className={cn('sticky top-0 z-10 flex items-center gap-2 p-2', className)} {...props} />
  );
}
