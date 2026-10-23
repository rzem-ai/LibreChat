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
}

function ComparePanel({ label, className, children }: ComparePanelProps): JSX.Element {
  const localize = useLocalize();

  return (
    <div className={cn('rounded-xl border p-4', className)}>
      <div className="text-xs font-medium text-text-secondary">{localize(label)}</div>
      <div className="[&>:first-child]:!mt-2">{children}</div>
    </div>
  );
}

export function Compare({ children }: PanelProps): JSX.Element {
  return <div className="mt-6 grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function Before({ children }: PanelProps): JSX.Element {
  return (
    <ComparePanel label="com_learning_compare_before" className="border-border-light">
      {children}
    </ComparePanel>
  );
}

export function After({ children }: PanelProps): JSX.Element {
  return (
    <ComparePanel label="com_learning_compare_after" className="border-border-heavy">
      {children}
    </ComparePanel>
  );
}
