import type { JSX } from 'react/jsx-runtime';
import type { HTMLAttributes } from 'react';
import { cn } from '~/utils';

const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div
    className={cn(
      'flex flex-col gap-3 rounded-xl border border-border-light bg-surface-primary p-5 text-text-primary',
      className,
    )}
    {...props}
  />
);

const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div className={cn('flex items-center justify-between gap-2', className)} {...props} />
);

const CardTitle = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): JSX.Element => (
  <h3 className={cn('flex items-center gap-2 text-base font-medium', className)} {...props}>
    {children}
  </h3>
);

const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div className={cn('flex-1 text-sm text-text-secondary', className)} {...props} />
);

const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div className={cn('flex items-center', className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
