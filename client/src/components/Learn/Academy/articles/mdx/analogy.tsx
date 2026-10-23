import { Info } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';

interface AnalogyProps {
  children: ReactNode;
}

export function Analogy({ children }: AnalogyProps): JSX.Element {
  return (
    <div className="mt-6 flex gap-3 rounded-lg border border-border-medium px-4 py-3">
      <Info className="mt-1 size-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <div className="[&>:first-child]:!mt-0 [&>p]:!mt-2">{children}</div>
    </div>
  );
}
