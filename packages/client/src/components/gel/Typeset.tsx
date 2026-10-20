import type { JSX } from 'react/jsx-runtime';
import type { HTMLAttributes } from 'react';
import { cn } from '~/utils';

/**
 * Typography for long-form content (MDX articles, release notes). Styles descendant
 * elements directly because `@tailwindcss/typography` is not enabled in this repo.
 */
const typesetClass = [
  '[&_h1]:text-3xl [&_h1]:font-medium [&_h1]:tracking-tight',
  '[&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-medium',
  '[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-medium',
  '[&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-text-secondary',
  '[&_a]:text-link [&_a]:underline [&_a]:underline-offset-4',
  '[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border-medium [&_blockquote]:pl-4',
  '[&_code]:rounded [&_code]:bg-surface-tertiary [&_code]:px-1 [&_code]:text-sm',
  '[&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-tertiary [&_pre]:p-4',
].join(' ');

export function Typeset({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn(typesetClass, className)} {...props} />;
}
