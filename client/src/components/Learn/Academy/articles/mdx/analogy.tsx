import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { useLocalize } from '~/hooks';

interface AnalogyProps {
  children: ReactNode;
}

export function Analogy({ children }: AnalogyProps): JSX.Element {
  const localize = useLocalize();

  return (
    <div className="mt-6 rounded-lg bg-surface-tertiary px-4 py-3 [&>:first-child]:!mt-0 [&>p]:!mt-2">
      <div className="text-xs font-medium text-text-secondary">
        {localize('com_learning_callout_analogy')}
      </div>
      {children}
    </div>
  );
}
