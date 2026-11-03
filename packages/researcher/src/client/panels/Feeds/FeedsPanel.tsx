import { useId, useMemo, useRef } from 'react';
import { Download, Rss, TriangleAlert, Upload } from 'lucide-react';
import { Button, EmptyState, Skeleton, useToastContext } from '@librechat/client';
import type { ChangeEvent, ReactElement } from 'react';
import type { TOpmlImportResult } from '../../../contract/types';
import type { PanelChromeProps } from '../chrome';
import { defaultPanelChrome } from '../frame';
import { useResearchFeedsQuery, useImportResearchFeedsMutation } from '../../hooks';
import { formatFolder, groupByFolder } from './folders';
import { downloadText, readFileText } from './links';
import { researchService } from '../../../contract';
import FeedCatalogue from './FeedCatalogue';
import FeedFolder from './FeedFolder';
import { useLocalize } from '../../hooks/localize';

/** Matches the server's OPML size cap, so an oversized file is refused before upload. */
const MAX_OPML_CHARS = 1_000_000;

function errorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
}

function FeedsSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function FeedsPanel({
  chrome = defaultPanelChrome,
}: PanelChromeProps): ReactElement {
  const { Header: PanelHeader, Content: PanelContent } = chrome;
  const localize = useLocalize();
  const headingId = useId();
  const listId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const { showToast } = useToastContext();
  const { data, isLoading, isError, refetch } = useResearchFeedsQuery();
  const importFeeds = useImportResearchFeedsMutation();
  const subscriptions = useMemo(() => data?.subscriptions ?? [], [data]);
  const maxPerUser = data?.maxPerUser ?? 0;
  const subscribed = useMemo(() => new Set(subscriptions.map((s) => s.feedId)), [subscriptions]);
  const atLimit = maxPerUser > 0 && subscriptions.length >= maxPerUser;
  const groups = useMemo(() => groupByFolder(subscriptions), [subscriptions]);
  const folderNames = useMemo(
    () => groups.flatMap((group) => (group.path ? [formatFolder(group.path)] : [])),
    [groups],
  );

  const onImported = (result: TOpmlImportResult) => {
    if (result.overLimit > 0) {
      showToast({
        message: localize('com_ui_feeds_imported_over_limit', {
          added: result.added,
          overLimit: result.overLimit,
          max: result.maxPerUser,
        }),
        status: 'warning',
      });
      return;
    }
    showToast({
      message: localize('com_ui_feeds_imported', {
        added: result.added,
        existing: result.existing,
      }),
      status: 'success',
    });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    /** UTF-8 needs at most four bytes a character, so a larger file cannot fit the cap. */
    const opml = file.size > MAX_OPML_CHARS * 4 ? '' : await readFileText(file);
    if (!opml || opml.length > MAX_OPML_CHARS) {
      showToast({ message: localize('com_ui_feeds_import_too_large'), status: 'error' });
      return;
    }
    importFeeds.mutate(
      { opml },
      {
        onSuccess: onImported,
        onError: (error) => {
          const code = errorCode(error);
          let message = localize('com_ui_feeds_import_error');
          if (code === 'research_opml_invalid') {
            message = localize('com_ui_feeds_import_invalid');
          } else if (code === 'research_opml_too_large') {
            message = localize('com_ui_feeds_import_too_large');
          }
          showToast({ message, status: 'error' });
        },
      },
    );
  };

  const onExport = async () => {
    try {
      const opml = await researchService.exportResearchFeeds();
      downloadText(opml, 'research-feeds.opml', 'text/x-opml');
    } catch {
      showToast({ message: localize('com_ui_feeds_export_error'), status: 'error' });
    }
  };

  let content;
  if (isError) {
    content = (
      <EmptyState
        icon={TriangleAlert}
        title={localize('com_ui_feeds_error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            {localize('com_ui_retry')}
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        {subscriptions.length === 0 ? (
          <EmptyState
            icon={Rss}
            title={localize('com_ui_feeds_empty_title')}
            description={localize('com_ui_feeds_empty')}
          />
        ) : (
          <>
            <p className="mb-2 text-xs text-text-secondary">
              {localize('com_ui_feeds_count', { used: subscriptions.length, max: maxPerUser })}
            </p>
            <h3 id={listId} className="sr-only">
              {localize('com_ui_feeds_subscriptions')}
            </h3>
            <ul className="flex flex-col gap-2" aria-labelledby={listId}>
              {groups.map((group) => (
                <FeedFolder key={group.key} group={group} folders={folderNames} />
              ))}
            </ul>
          </>
        )}
        <FeedCatalogue subscribed={subscribed} atLimit={atLimit} />
      </>
    );
  }

  return (
    <div
      role="region"
      aria-labelledby={headingId}
      className="flex h-full w-full flex-col overflow-hidden pt-2"
    >
      <PanelHeader title={localize('com_ui_feeds')} titleId={headingId}>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={importFeeds.isLoading || isError}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="mr-1.5 size-4" aria-hidden="true" />
            {localize('com_ui_feeds_import_button')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={subscriptions.length === 0}
            aria-label={localize('com_ui_feeds_export')}
            onClick={onExport}
          >
            <Download className="mr-1.5 size-4" aria-hidden="true" />
            {localize('com_ui_feeds_export_button')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".opml,.xml,text/xml,application/xml,text/x-opml"
            className="sr-only"
            tabIndex={-1}
            aria-label={localize('com_ui_feeds_import')}
            onChange={onFile}
          />
        </div>
      </PanelHeader>
      <PanelContent isLoading={isLoading} skeleton={<FeedsSkeleton />} className="px-3 pb-3">
        {content}
      </PanelContent>
    </div>
  );
}
