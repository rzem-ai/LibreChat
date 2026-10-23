import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';

interface StepsProps {
  children: ReactNode;
}

/** Plain numbered list: no circled badges, with a quieter, aligned marker. */
const stepsClass = [
  '[&_ol]:!list-decimal [&_ol]:!pl-6',
  '[&_ol>li]:mt-2 [&_ol>li]:pl-1',
  '[&_ol>li]:marker:text-text-secondary [&_ol>li]:marker:tabular-nums',
].join(' ');

export function Steps({ children }: StepsProps): JSX.Element {
  return <div className={stepsClass}>{children}</div>;
}
