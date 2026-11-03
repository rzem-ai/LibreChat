import { useId, useState } from 'react';
import { Button, useToastContext } from '@librechat/client';
import { ChevronDown, ChevronRight, Folder, Pencil } from 'lucide-react';
import type { ReactElement } from 'react';
import type { FeedFolderGroup } from './folders';
import { useRenameResearchFeedFolderMutation } from '../../hooks';
import { formatFolder, parseFolder } from './folders';
import FolderForm from './FolderForm';
import FeedRow from './FeedRow';
import { useLocalize } from '../../hooks/localize';

export default function FeedFolder({
  group,
  folders,
}: {
  group: FeedFolderGroup;
  /** Every folder the user has, offered when moving a feed. */
  folders: string[];
}): ReactElement {
  const localize = useLocalize();
  const listId = useId();
  const { showToast } = useToastContext();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const rename = useRenameResearchFeedFolderMutation();
  const name = group.path ? formatFolder(group.path) : localize('com_ui_feeds_unfiled');

  const onRename = (text: string) => {
    const to = parseFolder(text);
    setRenaming(false);
    if (!group.path || !to || formatFolder(to) === name) {
      return;
    }
    rename.mutate(
      { from: group.path, to },
      {
        onError: () =>
          showToast({ message: localize('com_ui_feeds_folder_rename_error'), status: 'error' }),
      },
    );
  };

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-medium text-text-primary hover:bg-surface-hover"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          )}
          <Folder className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="truncate">{name}</span>
          <span className="ml-auto shrink-0 text-xs font-normal text-text-secondary">
            {group.subscriptions.length}
          </span>
        </button>
        {group.path && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            disabled={rename.isLoading}
            aria-label={localize('com_ui_feeds_folder_rename', { name })}
            onClick={() => setRenaming(true)}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      {renaming && (
        <FolderForm
          label={localize('com_ui_feeds_folder_name')}
          initial={name}
          onSubmit={onRename}
          onCancel={() => setRenaming(false)}
        />
      )}
      {open && (
        <ul id={listId} className="mt-1 flex flex-col gap-2 pl-2">
          {group.subscriptions.map((subscription) => (
            <FeedRow key={subscription.feedId} subscription={subscription} folders={folders} />
          ))}
        </ul>
      )}
    </li>
  );
}
