import type { TUserMemory } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import MemoryEmptyState from './MemoryEmptyState';
import { getMemoryListKey } from './address';
import MemoryCard from './MemoryCard';
import { useLocalize } from '~/hooks';

interface MemoryListProps {
  memories: TUserMemory[];
  hasUpdateAccess: boolean;
  isFiltered?: boolean;
  // Deloitte Custom Change: forwarded to MemoryCard so the Settings tab can use the
  // inline delete flow instead of the original modal confirmation.
  deleteMode?: 'dialog' | 'inline';
  /**
   * Deloitte Custom Change: forwarded to the empty state's call-to-action slot when the
   * list is empty (the Settings tab uses this for its "Add a memory" trigger).
   */
  emptyStateAction?: ReactNode;
}

export default function MemoryList({
  memories,
  hasUpdateAccess,
  isFiltered = false,
  deleteMode = 'dialog',
  emptyStateAction,
}: MemoryListProps) {
  const localize = useLocalize();

  if (memories.length === 0) {
    return <MemoryEmptyState isFiltered={isFiltered} action={emptyStateAction} />;
  }

  return (
    <div className="space-y-2" role="list" aria-label={localize('com_ui_memories')}>
      {memories.map((memory) => (
        <div key={getMemoryListKey(memory)} role="listitem">
          <MemoryCard memory={memory} hasUpdateAccess={hasUpdateAccess} deleteMode={deleteMode} />
        </div>
      ))}
    </div>
  );
}
