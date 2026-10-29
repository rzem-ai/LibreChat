import { Brain } from 'lucide-react';
import { EmptyState } from '@librechat/client';
import type { ReactNode } from 'react';
import { useLocalize } from '~/hooks';

interface MemoryEmptyStateProps {
  isFiltered?: boolean;
  /**
   * Deloitte Custom Change: optional call-to-action rendered below the empty-state copy
   * (the Settings tab uses this for its "Add a memory" trigger).
   */
  action?: ReactNode;
}

export default function MemoryEmptyState({ isFiltered = false, action }: MemoryEmptyStateProps) {
  const localize = useLocalize();

  if (isFiltered) {
    return <EmptyState icon={Brain} description={localize('com_ui_no_memories_match')} />;
  }

  return (
    <EmptyState
      icon={Brain}
      title={localize('com_ui_no_memories_title')}
      description={localize('com_ui_no_memories')}
      action={action}
    />
  );
}
