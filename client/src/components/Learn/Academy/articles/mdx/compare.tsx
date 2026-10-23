import { Check, X } from 'lucide-react';
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
  badge: ReactNode;
}

function ComparePanel({ label, badge, children }: ComparePanelProps): JSX.Element {
  const localize = useLocalize();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex-1 px-2 pt-2 [&>:first-child]:!mt-0">{children}</div>
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-secondary py-2.5 text-sm">
        {badge}
        {localize(label)}
      </div>
    </div>
  );
}

interface BadgeProps {
  className: string;
  children: ReactNode;
}

function Badge({ className, children }: BadgeProps): JSX.Element {
  return (
    <span className={cn('flex size-5 items-center justify-center rounded-full', className)}>
      {children}
    </span>
  );
}

export function Compare({ children }: PanelProps): JSX.Element {
  return (
    <div className="mt-6 grid gap-6 rounded-xl border border-border-light bg-surface-primary p-4 sm:grid-cols-2">
      {children}
    </div>
  );
}

export function Before({ children }: PanelProps): JSX.Element {
  return (
    <ComparePanel
      label="com_learning_compare_before"
      badge={
        <Badge className="bg-surface-tertiary text-text-secondary">
          <X className="size-3" aria-hidden="true" />
        </Badge>
      }
    >
      {children}
    </ComparePanel>
  );
}

export function After({ children }: PanelProps): JSX.Element {
  return (
    <ComparePanel
      label="com_learning_compare_after"
      badge={
        <Badge className="bg-accent-primary text-white">
          <Check className="size-3" aria-hidden="true" />
        </Badge>
      }
    >
      {children}
    </ComparePanel>
  );
}
