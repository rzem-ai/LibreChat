import { useState, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { Trans } from 'react-i18next';
import {
  Label,
  Button,
  Spinner,
  OGDialog,
  TrashIcon,
  TooltipAnchor,
  OGDialogTrigger,
  OGDialogTemplate,
} from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import MemoryEditDialog from './MemoryEditDialog';
import useMemoryDelete from './useMemoryDelete';
import { getMemoryAddress } from './address';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MemoryCardActionsProps {
  memory: TUserMemory;
  /**
   * Deloitte Custom Change: when provided (Settings tab only), the delete button invokes
   * this instead of opening the original upstream confirmation dialog.
   */
  onRequestDelete?: () => void;
}

export default function MemoryCardActions({ memory, onRequestDelete }: MemoryCardActionsProps) {
  // Deloitte Custom Change: Memory HITL approval UX integration.

  const localize = useLocalize();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { confirmDelete, isDeleting } = useMemoryDelete(memory, () => setDeleteOpen(false));

  const buttonBaseClass = cn(
    'flex size-7 items-center justify-center rounded-md',
    'transition-colors duration-150',
    'text-text-secondary hover:text-text-primary',
    'hover:bg-surface-tertiary',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
  );

  if (!getMemoryAddress(memory)) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Edit Button */}
      <MemoryEditDialog
        open={editOpen}
        memory={memory}
        onOpenChange={setEditOpen}
        triggerRef={triggerRef as React.MutableRefObject<HTMLButtonElement | null>}
      >
        <OGDialogTrigger asChild>
          <TooltipAnchor
            description={localize('com_ui_edit_memory')}
            side="top"
            render={
              <Button
                ref={triggerRef}
                variant="ghost"
                size="icon"
                className={buttonBaseClass}
                aria-label={localize('com_ui_edit')}
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
        </OGDialogTrigger>
      </MemoryEditDialog>

      {/* Delete Button */}
      {onRequestDelete ? (
        <TooltipAnchor
          description={localize('com_ui_delete_memory')}
          side="top"
          render={
            <Button
              variant="ghost"
              size="icon"
              className={buttonBaseClass}
              aria-label={localize('com_ui_delete')}
              onClick={onRequestDelete}
            >
              <TrashIcon className="size-3.5" aria-hidden="true" />
            </Button>
          }
        />
      ) : (
        <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <OGDialogTrigger asChild>
            <TooltipAnchor
              description={localize('com_ui_delete_memory')}
              side="top"
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={buttonBaseClass}
                  aria-label={localize('com_ui_delete')}
                  onClick={() => setDeleteOpen(true)}
                >
                  {isDeleting ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <TrashIcon className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
              }
            />
          </OGDialogTrigger>
          <OGDialogTemplate
            showCloseButton={false}
            title={localize('com_ui_delete_memory')}
            className="w-11/12 max-w-lg"
            main={
              <div className="space-y-2">
                <Label className="text-left text-sm font-medium">
                  <Trans
                    i18nKey="com_ui_delete_confirm_strong"
                    values={{ title: memory.key || localize('com_ui_memory') }}
                    components={{ strong: <strong /> }}
                  />
                </Label>
                <p className="text-sm text-text-secondary">
                  {localize('com_ui_memory_delete_description')}
                </p>
              </div>
            }
            selection={{
              selectHandler: confirmDelete,
              selectClasses:
                'bg-surface-destructive text-text-on-status hover:bg-surface-destructive-hover',
              selectText: localize('com_ui_delete'),
            }}
          />
        </OGDialog>
      )}
    </div>
  );
}
