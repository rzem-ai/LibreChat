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
    <div className="flex flex-col gap-4 p-5">
      <div className="flex-1 font-mono text-sm [&>:first-child]:!mt-0 [&_li]:relative [&_li]:pl-4 [&_li]:text-text-primary [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:content-['-'] [&_p]:!text-text-primary [&_ul]:!list-none [&_ul]:!pl-0">
        {children}
      </div>
      <div className="flex items-center justify-center gap-2 text-sm">
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
    <div className="mt-6 grid divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-surface-primary sm:grid-cols-2 sm:divide-x sm:divide-y-0">
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
        <Badge className="bg-surface-submit text-text-on-status">
          <Check className="size-3" aria-hidden="true" />
        </Badge>
      }
    >
      {children}
    </ComparePanel>
  );
}
