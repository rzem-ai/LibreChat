import { Info, Lightbulb, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type CalloutType = 'analogy' | 'note' | 'warning';

interface CalloutProps {
  type?: CalloutType;
  children: ReactNode;
}

const variants: Record<CalloutType, { icon: LucideIcon; label: TranslationKeys; tone: string }> = {
  analogy: {
    icon: Lightbulb,
    label: 'com_learning_callout_analogy',
    tone: 'border-border-heavy bg-surface-secondary',
  },
  note: {
    icon: Info,
    label: 'com_learning_callout_note',
    tone: 'border-border-medium bg-surface-secondary',
  },
  warning: {
    icon: TriangleAlert,
    label: 'com_learning_callout_warning',
    tone: 'border-yellow-500 bg-yellow-500/10',
  },
};

export function Callout({ type = 'note', children }: CalloutProps): JSX.Element {
  const localize = useLocalize();
  const { icon: Icon, label, tone } = variants[type];

  return (
    <div
      role="note"
      className={cn('mt-6 rounded-lg border-l-4 px-4 py-3 [&>:last-child]:mb-0', tone)}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
        <Icon className="size-4" aria-hidden="true" />
        {localize(label)}
      </div>
      <div className="[&>p:first-child]:!mt-2">{children}</div>
    </div>
  );
}
