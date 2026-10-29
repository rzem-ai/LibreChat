import { useState } from 'react';
import { Trans } from 'react-i18next';
import { Button, Spinner } from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import MemoryCardActions from './MemoryCardActions';
import useMemoryDelete from './useMemoryDelete';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MemoryCardProps {
  memory: TUserMemory;
  hasUpdateAccess: boolean;
  /**
   * Deloitte Custom Change: 'dialog' (default, original upstream behavior) opens a modal
   * confirmation; 'inline' expands the row itself instead — used by the Settings tab.
   */
  deleteMode?: 'dialog' | 'inline';
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function MemoryCard({
  memory,
  hasUpdateAccess,
  deleteMode = 'dialog',
}: MemoryCardProps) {
  const localize = useLocalize();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { confirmDelete, isDeleting } = useMemoryDelete(memory, () => setIsConfirmingDelete(false));
  const displayKey = memory.key || localize('com_ui_memory');

  return (
    <div
      className={cn(
        'rounded-lg px-3 py-2.5',
        'border border-border-light bg-transparent',
        'hover:bg-surface-secondary',
      )}
    >
      {/* Row 1: Key + Agent badge + Token count + Actions */}
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-text-primary">{displayKey}</span>
        {memory.agentId != null && (
          <span
            className="shrink-0 truncate rounded-full border border-border-light px-2 py-0.5 text-xs text-text-secondary"
            title={localize('com_ui_memory_agent_badge')}
          >
            {memory.agentName ?? memory.agentId}
          </span>
        )}
        {memory.tokenCount !== undefined && (
          <span className="shrink-0 text-xs text-text-secondary">
            {memory.tokenCount}{' '}
            {localize(memory.tokenCount === 1 ? 'com_ui_token' : 'com_ui_tokens')}
          </span>
        )}
        {hasUpdateAccess && !isConfirmingDelete && (
          <div className="ml-auto shrink-0">
            <MemoryCardActions
              memory={memory}
              onRequestDelete={
                deleteMode === 'inline' ? () => setIsConfirmingDelete(true) : undefined
              }
            />
          </div>
        )}
      </div>

      {/* Row 2: Value + Date, or inline delete confirmation */}
      {isConfirmingDelete ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-primary">
            <Trans i18nKey="com_ui_delete_memory_inline_confirm" values={{ title: displayKey }} />
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmingDelete(false)}
            >
              {localize('com_ui_cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Spinner className="size-4" /> : localize('com_ui_delete')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-text-primary" title={memory.value}>
            {memory.value}
          </p>
          <span className="shrink-0 text-xs text-text-secondary">
            {formatDate(memory.updated_at)}
          </span>
        </div>
      )}
    </div>
  );
}
