import { useId, useState } from 'react';
import { Button, useToastContext } from '@librechat/client';
import { ChevronDown, ChevronRight, FolderInput, X } from 'lucide-react';
import type { ReactElement } from 'react';
import type { TResearchFeedSubscription } from '../../../contract/types';
import {
  useMoveResearchFeedMutation,
  useResearchFeedItemsQuery,
  useUnsubscribeResearchFeedMutation,
} from '../../hooks';
import { formatFolder, parseFolder } from './folders';
import FolderForm from './FolderForm';
import { safeHttpUrl } from './links';
import { useLocalize } from '../../hooks/localize';

function FeedHistory({ feedId, id }: { feedId: string; id: string }) {
  const localize = useLocalize();
  const { data, isLoading, isError } = useResearchFeedItemsQuery(feedId, { enabled: true });
  if (isLoading) {
    return (
      <p id={id} className="mt-2 text-xs text-text-secondary">
        {localize('com_ui_loading')}
      </p>
    );
  }
  if (isError) {
    return (
      <p id={id} className="mt-2 text-xs text-text-secondary">
        {localize('com_ui_feeds_history_error')}
      </p>
    );
  }
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <p id={id} className="mt-2 text-xs text-text-secondary">
        {localize('com_ui_feeds_history_empty')}
      </p>
    );
  }
  return (
    <ul id={id} className="mt-2 flex flex-col gap-1.5">
      {items.map((item) => {
        const href = safeHttpUrl(item.link);
        const title = item.title ?? item.link ?? item.guid;
        return (
          <li key={item.guid} className="text-xs">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-primary hover:underline"
              >
                {title}
              </a>
            ) : (
              <span className="text-text-primary">{title}</span>
            )}
            <span className="ml-2 text-text-secondary">
              {new Date(item.publishedAt).toLocaleDateString()}
            </span>
            {item.archived && (
              <span className="ml-2 text-text-secondary">
                {localize('com_ui_feeds_item_cited')}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function FeedRow({
  subscription,
  folders = [],
}: {
  subscription: TResearchFeedSubscription;
  /** Existing folder names, offered when moving this feed. */
  folders?: string[];
}): ReactElement {
  const localize = useLocalize();
  const historyId = useId();
  const { showToast } = useToastContext();
  const [expanded, setExpanded] = useState(false);
  const [moving, setMoving] = useState(false);
  const move = useMoveResearchFeedMutation();
  const unsubscribe = useUnsubscribeResearchFeedMutation();
  const feed = subscription.feed;
  const name = subscription.label ?? feed?.title ?? feed?.url ?? subscription.feedId;

  let status: string | undefined;
  if (feed?.disabled) {
    status = localize('com_ui_feeds_status_disabled');
  } else if (feed?.lastStatus === 'error') {
    status = localize('com_ui_feeds_status_error');
  }

  const onUnsubscribe = () =>
    unsubscribe.mutate(subscription.feedId, {
      onError: () =>
        showToast({ message: localize('com_ui_feeds_unsubscribe_error'), status: 'error' }),
    });

  const onMove = (text: string) => {
    setMoving(false);
    move.mutate(
      { feedId: subscription.feedId, folder: parseFolder(text) },
      {
        onError: () => showToast({ message: localize('com_ui_feeds_move_error'), status: 'error' }),
      },
    );
  };

  return (
    <li className="rounded-lg border border-border-light px-3 py-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? historyId : undefined}
          aria-label={localize('com_ui_feeds_history', { name })}
          onClick={() => setExpanded((open) => !open)}
          className="rounded p-0.5 text-text-secondary hover:text-text-primary"
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text-primary">{name}</p>
          {status && <p className="text-xs text-text-secondary">{status}</p>}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          disabled={move.isLoading}
          aria-label={localize('com_ui_feeds_move', { name })}
          onClick={() => setMoving(true)}
        >
          <FolderInput className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          disabled={unsubscribe.isLoading}
          aria-label={localize('com_ui_feeds_unsubscribe', { name })}
          onClick={onUnsubscribe}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {moving && (
        <FolderForm
          label={localize('com_ui_feeds_move_folder')}
          initial={subscription.folder?.length ? formatFolder(subscription.folder) : ''}
          suggestions={folders}
          onSubmit={onMove}
          onCancel={() => setMoving(false)}
        />
      )}
      {expanded && <FeedHistory feedId={subscription.feedId} id={historyId} />}
    </li>
  );
}
