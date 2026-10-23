import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PanelProps {
  children: ReactNode;
}

interface ComparePanelProps extends PanelProps {
  label: TranslationKeys;
  className: string;
  labelClassName: string;
}

function ComparePanel({
  label,
  className,
  labelClassName,
  children,
}: ComparePanelProps): JSX.Element {
  const localize = useLocalize();

  return (
    <div className={cn('rounded-xl border p-4', className)}>
      <div className={cn('text-sm font-medium', labelClassName)}>{localize(label)}</div>
      <div className="[&>:first-child]:!mt-2">{children}</div>
    </div>
  );
}

export function Compare({ children }: PanelProps): JSX.Element {
  return <div className="mt-6 grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function Before({ children }: PanelProps): JSX.Element {
  return (
    <ComparePanel
      label="com_learning_compare_before"
      className="border-border-light [&_li]:text-text-tertiary [&_p]:!text-text-tertiary"
      labelClassName="text-text-tertiary"
    >
      {children}
    </ComparePanel>
  );
}

export function After({ children }: PanelProps): JSX.Element {
  return (
    <ComparePanel
      label="com_learning_compare_after"
      className="border-border-heavy bg-surface-primary shadow-sm [&_li]:text-text-primary [&_p]:!text-text-primary"
      labelClassName="text-accent-primary"
    >
      {children}
    </ComparePanel>
  );
}
