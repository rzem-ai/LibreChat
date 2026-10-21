import { TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';
import { useLocalize } from '~/hooks';

/**
 * [Deloitte Custom Change] Warn users against saving sensitive or confidential information.
 * @returns A localized memory-safety note for memory create and edit dialogs.
 */
export default function MemorySensitiveDataNotice(): ReactElement {
  const localize = useLocalize();

  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-border-light bg-surface-secondary p-3"
      role="note"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-text-warning" aria-hidden="true" />
      <p className="text-xs text-text-primary">
        {localize('com_ui_memory_sensitive_data_warning')}
      </p>
    </div>
  );
}
