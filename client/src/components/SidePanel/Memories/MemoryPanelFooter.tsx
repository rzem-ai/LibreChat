// Deloitte Custom Change: admin-settings + pagination footer shared between the sidebar
// Memories panel and the Settings tab's Memories panel, extracted to avoid duplicating
// this block across the two views built on the same useMemoryPanelState.
import { Button } from '@librechat/client';
import { SystemRoles } from 'librechat-data-provider';
import type { Dispatch, SetStateAction } from 'react';
import { MEMORY_PAGE_SIZE } from './useMemoryPanelState';
import { useAuthContext, useLocalize } from '~/hooks';
import AdminSettings from './AdminSettings';

interface MemoryPanelFooterProps {
  totalCount: number;
  pageIndex: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  totalPages: number;
}

export default function MemoryPanelFooter({
  totalCount,
  pageIndex,
  setPageIndex,
  totalPages,
}: MemoryPanelFooterProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const hasPagination = totalCount > MEMORY_PAGE_SIZE;

  if (!isAdmin && !hasPagination) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-2">
      {isAdmin ? <AdminSettings /> : <div />}
      {hasPagination && (
        <div
          className="flex items-center gap-2"
          role="navigation"
          aria-label={localize('com_ui_pagination')}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
            disabled={pageIndex === 0}
            aria-label={localize('com_ui_prev')}
          >
            {localize('com_ui_prev')}
          </Button>
          <div className="whitespace-nowrap text-sm" aria-live="polite">
            {pageIndex + 1} / {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
            disabled={pageIndex + 1 >= totalPages}
            aria-label={localize('com_ui_next')}
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      )}
    </div>
  );
}
