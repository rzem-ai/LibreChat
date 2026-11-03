import { useId, useMemo } from 'react';
import { Button, useToastContext } from '@librechat/client';
import type { ReactElement } from 'react';
import type { TResearchFeed } from '../../../contract/types';
import {
  useResearchFeedCatalogueQuery,
  useSubscribeResearchCatalogueFeedMutation,
} from '../../hooks';
import { useLocalize } from '../../hooks/localize';

function groupByCategory(
  feeds: TResearchFeed[],
  fallback: string,
): Array<[string, TResearchFeed[]]> {
  const groups = new Map<string, TResearchFeed[]>();
  for (const feed of feeds) {
    const key = feed.catalogueCategory ?? fallback;
    groups.set(key, [...(groups.get(key) ?? []), feed]);
  }
  return [...groups.entries()];
}

export default function FeedCatalogue({
  subscribed,
  atLimit,
}: {
  subscribed: ReadonlySet<string>;
  atLimit: boolean;
}): ReactElement | null {
  const localize = useLocalize();
  const headingId = useId();
  const { showToast } = useToastContext();
  const { data, isError } = useResearchFeedCatalogueQuery();
  const subscribe = useSubscribeResearchCatalogueFeedMutation();
  const fallback = localize('com_ui_feeds_catalogue_general');
  const groups = useMemo(() => groupByCategory(data?.feeds ?? [], fallback), [data, fallback]);

  if (isError || groups.length === 0) {
    return null;
  }

  const onSubscribe = (feedId: string) =>
    subscribe.mutate(feedId, {
      onError: (error) => {
        const code = (error as { response?: { data?: { error_code?: string } } })?.response?.data
          ?.error_code;
        showToast({
          message: localize(
            code === 'research_feed_limit'
              ? 'com_ui_feeds_limit_reached'
              : 'com_ui_feeds_subscribe_error',
          ),
          status: 'error',
        });
      },
    });

  return (
    <section aria-labelledby={headingId} className="mt-4">
      <h3 id={headingId} className="text-sm font-medium text-text-primary">
        {localize('com_ui_feeds_catalogue')}
      </h3>
      {atLimit && (
        <p className="mt-1 text-xs text-text-secondary">{localize('com_ui_feeds_limit_reached')}</p>
      )}
      {groups.map(([category, feeds]) => (
        <div key={category} className="mt-2">
          <h4 className="text-xs font-medium text-text-secondary">{category}</h4>
          <ul className="mt-1 flex flex-col gap-1">
            {feeds.map((feed) => {
              const name = feed.title ?? feed.url;
              const isSubscribed = subscribed.has(feed.id);
              return (
                <li key={feed.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-text-primary">{name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={isSubscribed || atLimit || subscribe.isLoading}
                    aria-label={localize(
                      isSubscribed ? 'com_ui_feeds_subscribed' : 'com_ui_feeds_subscribe',
                      { name },
                    )}
                    onClick={() => onSubscribe(feed.id)}
                  >
                    {localize(isSubscribed ? 'com_ui_feeds_subscribed_short' : 'com_ui_feeds_add')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
