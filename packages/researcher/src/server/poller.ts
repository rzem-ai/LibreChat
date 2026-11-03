import { logger as defaultLogger, runAsSystem } from '@librechat/data-schemas';
import type { TResearchConfig } from '../contract/research';
import type { SnapshotRecorder } from './snapshots';
import type { FeedMethods, IFeed } from '../db';
import type { ParsedFeedItem } from './rss';
import type { SafeFetcher } from './fetch';
import { PageFetchError, pageToMarkdown } from './fetch';
import { parseFeed } from './rss';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const POLL_LEASE_MS = 5 * MINUTE_MS;
const FEEDS_PER_PASS = 20;
const NEW_ITEMS_PER_POLL = 50;
/**
 * Item pages fetched per poll. With the fetch timeout this keeps one poll well inside
 * its lease; further teasers keep the feed's own text.
 */
const PAGE_FETCHES_PER_POLL = 10;
/** Feed content shorter than this is treated as a teaser and the item page is fetched. */
const MIN_CONTENT_CHARS = 280;

export type FeedPollerDeps = {
  methods: Pick<
    FeedMethods,
    'claimFeedForPoll' | 'recordFeedPoll' | 'findKnownFeedGuids' | 'insertFeedItem'
  >;
  /** Deployment-wide research config (feeds are shared across users). */
  getConfig: () => Promise<TResearchConfig | undefined>;
  fetcher: SafeFetcher;
  recorder: SnapshotRecorder;
  instanceId: string;
  now?: () => Date;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'debug'>;
};

export type FeedPoller = {
  /** Polls due feeds until none are due or the pass limit is reached; returns feeds polled. */
  pollOnce: () => Promise<number>;
};

function failureCode(error: unknown): string {
  if (error instanceof PageFetchError) {
    return error.code;
  }
  return (error as Error)?.message === 'not_a_feed' || (error as Error)?.message === 'invalid_xml'
    ? 'feed_invalid'
    : 'feed_failed';
}

/** Exponential back-off from the poll interval, capped at a day. */
function backoffMs(intervalMs: number, failures: number): number {
  return Math.min(DAY_MS, intervalMs * 2 ** Math.max(0, failures));
}

/**
 * Polls subscribed feeds (design 5.6). Each feed is leased by one replica at a time, so
 * a feed with any number of subscribers costs one request per interval. New items become
 * shared snapshots: the feed's own content when it carries the article, otherwise the
 * item page fetched through the SSRF-guarded fetcher.
 */
export function createFeedPoller(deps: FeedPollerDeps): FeedPoller {
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;

  async function itemMarkdown(
    item: ParsedFeedItem,
    budget: { pages: number },
  ): Promise<{ markdown: string; title?: string }> {
    const html = item.contentHtml ?? '';
    const fromFeed = pageToMarkdown({
      finalUrl: item.link ?? '',
      status: 200,
      contentType: 'text/html',
      body: `<main>${html}</main>`,
    }).markdown;
    if (fromFeed.length >= MIN_CONTENT_CHARS || !item.link || budget.pages <= 0) {
      return { markdown: fromFeed || item.title || '' };
    }
    budget.pages -= 1;
    try {
      const page = await deps.fetcher.fetch(item.link);
      const converted = pageToMarkdown(page);
      return converted.markdown ? converted : { markdown: fromFeed || item.title || '' };
    } catch {
      return { markdown: fromFeed || item.title || '' };
    }
  }

  async function storeNewItems(feed: IFeed, items: ParsedFeedItem[]): Promise<number> {
    const newest = [...items]
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, NEW_ITEMS_PER_POLL);
    const known = new Set(
      await deps.methods.findKnownFeedGuids(
        feed.id,
        newest.map((item) => item.guid),
      ),
    );
    let stored = 0;
    const budget = { pages: PAGE_FETCHES_PER_POLL };
    for (const item of newest) {
      if (known.has(item.guid)) {
        continue;
      }
      const publishedAt = item.publishedAt ?? now();
      const { markdown, title } = await itemMarkdown(item, budget);
      if (!markdown.trim()) {
        continue;
      }
      const snapshot = await deps.recorder.record({
        userId: null,
        sourceKind: 'rss',
        reference: `${item.link ?? item.guid}@${publishedAt.toISOString()}`,
        stableReference: true,
        ...(item.link ? { url: item.link } : {}),
        ...((item.title ?? title) ? { title: item.title ?? title } : {}),
        feedId: feed.id,
        markdown,
      });
      const inserted = await deps.methods.insertFeedItem({
        feedId: feed.id,
        guid: item.guid,
        ...(item.link ? { link: item.link } : {}),
        ...(item.title ? { title: item.title } : {}),
        publishedAt,
        snapshotId: snapshot.id,
      });
      if (inserted) {
        stored += 1;
      }
    }
    return stored;
  }

  async function pollFeed(feed: IFeed, config: TResearchConfig): Promise<void> {
    const intervalMs = config.feeds.pollIntervalMinutes * MINUTE_MS;
    const at = now();
    try {
      const result = await deps.fetcher.fetchConditional(feed.url, {
        etag: feed.etag,
        lastModified: feed.lastModified,
      });
      if (result.notModified) {
        await deps.methods.recordFeedPoll(feed.id, deps.instanceId, {
          ok: true,
          status: 'not_modified',
          nextPollAt: new Date(at.getTime() + intervalMs),
          disableAfterFailures: config.feeds.disableAfterFailures,
        });
        return;
      }
      const parsed = parseFeed(result.body);
      const stored = await storeNewItems(feed, parsed.items);
      await deps.methods.recordFeedPoll(feed.id, deps.instanceId, {
        ok: true,
        status: 'ok',
        ...(result.etag ? { etag: result.etag } : {}),
        ...(result.lastModified ? { lastModified: result.lastModified } : {}),
        ...(parsed.title ? { title: parsed.title.slice(0, 512) } : {}),
        ...(parsed.siteUrl ? { siteUrl: parsed.siteUrl.slice(0, 2048) } : {}),
        nextPollAt: new Date(at.getTime() + intervalMs),
        disableAfterFailures: config.feeds.disableAfterFailures,
      });
      log.debug(`[research] Polled feed ${feed.id}: ${stored} new items`);
    } catch (error) {
      const code = failureCode(error);
      await deps.methods.recordFeedPoll(feed.id, deps.instanceId, {
        ok: false,
        status: 'error',
        error: code,
        nextPollAt: new Date(
          at.getTime() + backoffMs(intervalMs, (feed.consecutiveFailures ?? 0) + 1),
        ),
        disableAfterFailures: config.feeds.disableAfterFailures,
      });
      log.warn(`[research] Feed ${feed.id} poll failed: ${code}`);
    }
  }

  async function pollOnce(): Promise<number> {
    const config = await deps.getConfig();
    if (!config?.enabled) {
      return 0;
    }
    let polled = 0;
    for (let index = 0; index < FEEDS_PER_PASS; index++) {
      const feed = await runAsSystem(() =>
        deps.methods.claimFeedForPoll({
          instanceId: deps.instanceId,
          leaseMs: POLL_LEASE_MS,
          now: now(),
        }),
      );
      if (!feed) {
        break;
      }
      await runAsSystem(() => pollFeed(feed, config));
      polled += 1;
    }
    return polled;
  }

  return { pollOnce };
}
