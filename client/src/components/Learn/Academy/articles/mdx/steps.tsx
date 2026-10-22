import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';

interface StepsProps {
  children: ReactNode;
}

const stepsClass = [
  '[&_ol]:!list-none [&_ol]:!pl-0 [&_ol]:[counter-reset:step]',
  '[&_ol>li]:relative [&_ol>li]:mt-4 [&_ol>li]:pl-10 [&_ol>li]:[counter-increment:step]',
  '[&_ol>li]:before:absolute [&_ol>li]:before:left-0 [&_ol>li]:before:top-0',
  '[&_ol>li]:before:flex [&_ol>li]:before:size-7 [&_ol>li]:before:items-center',
  '[&_ol>li]:before:justify-center [&_ol>li]:before:rounded-full',
  '[&_ol>li]:before:border [&_ol>li]:before:border-border-medium',
  '[&_ol>li]:before:text-xs [&_ol>li]:before:font-medium [&_ol>li]:before:text-text-secondary',
  '[&_ol>li]:before:content-[counter(step)]',
].join(' ');

export function Steps({ children }: StepsProps): JSX.Element {
  return <div className={stepsClass}>{children}</div>;
}
