import { logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type {
  TResearchFeed,
  TOpmlImportResult,
  TResearchFeedItem,
  TResearchFeedSubscription,
} from '../contract/types';
import type { TResearchConfig } from '../contract/research';
import type { FeedMethods, FeedSubscriptionWithFeed, IFeed, IFeedItem } from '../db';
import { getResearchConfig } from './config';
import { buildOpml, parseOpml } from './opml';

const DAY_MS = 24 * 3_600_000;
/** OPML exports from feed readers run to tens of kilobytes; this leaves ample room. */
const MAX_OPML_CHARS = 1_000_000;
const MAX_HISTORY_ITEMS = 500;
const MAX_CATEGORY_CHARS = 64;
const MAX_FOLDER_DEPTH = 8;
const MAX_FOLDER_CHARS = 128;

type FeedRequest = Request & {
  user?: { id?: string };
  config?: { research?: TResearchConfig };
};

export type FeedHandlerMethods = Pick<
  FeedMethods,
  | 'upsertFeed'
  | 'getFeedById'
  | 'subscribeToFeed'
  | 'unsubscribeFromFeed'
  | 'countFeedSubscriptions'
  | 'getFeedSubscriptions'
  | 'setFeedDisabled'
  | 'setFeedCatalogue'
  | 'listCatalogueFeeds'
  | 'getFeedItems'
  | 'setFeedSubscriptionFolder'
  | 'renameFeedFolder'
>;

export type FeedHandlers = {
  listSubscriptions: (req: Request, res: Response) => Promise<void>;
  unsubscribe: (req: Request, res: Response) => Promise<void>;
  importOpml: (req: Request, res: Response) => Promise<void>;
  exportOpml: (req: Request, res: Response) => Promise<void>;
  listItems: (req: Request, res: Response) => Promise<void>;
  listCatalogue: (req: Request, res: Response) => Promise<void>;
  subscribeCatalogue: (req: Request, res: Response) => Promise<void>;
  moveFeed: (req: Request, res: Response) => Promise<void>;
  renameFolder: (req: Request, res: Response) => Promise<void>;
  /** Admin only: the route applies the admin capability check. */
  addCatalogueFeed: (req: Request, res: Response) => Promise<void>;
  /** Admin only: the route applies the admin capability check. */
  updateCatalogueFeed: (req: Request, res: Response) => Promise<void>;
};

function iso(value: Date | string | undefined): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

/** Feed-supplied links reach an `href`, so only http(s) survives. */
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The user's view of a shared feed: an allow-list, so poll internals stay private. */
export function toFeedResponse(feed: IFeed): TResearchFeed {
  return {
    id: feed.id,
    url: feed.url,
    ...(feed.title ? { title: feed.title } : {}),
    ...(isHttpUrl(feed.siteUrl) ? { siteUrl: feed.siteUrl } : {}),
    ...(feed.lastPolledAt ? { lastPolledAt: iso(feed.lastPolledAt) } : {}),
    ...(feed.lastStatus ? { lastStatus: feed.lastStatus } : {}),
    ...(feed.lastError ? { lastError: feed.lastError } : {}),
    disabled: feed.disabled === true,
    catalogue: feed.catalogue === true,
    ...(feed.catalogueCategory ? { catalogueCategory: feed.catalogueCategory } : {}),
  };
}

function toSubscriptionResponse(subscription: FeedSubscriptionWithFeed): TResearchFeedSubscription {
  return {
    feedId: subscription.feedId,
    ...(subscription.label ? { label: subscription.label } : {}),
    ...(subscription.folder?.length ? { folder: subscription.folder } : {}),
    source: subscription.source,
    ...(subscription.createdAt ? { createdAt: iso(subscription.createdAt) } : {}),
    ...(subscription.feed ? { feed: toFeedResponse(subscription.feed) } : {}),
  };
}

function toItemResponse(item: IFeedItem): TResearchFeedItem {
  return {
    guid: item.guid,
    ...(item.title ? { title: item.title } : {}),
    ...(isHttpUrl(item.link) ? { link: item.link } : {}),
    publishedAt: new Date(item.publishedAt).toISOString(),
    archived: item.archived === true,
  };
}

function category(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, MAX_CATEGORY_CHARS)
    : undefined;
}

/**
 * A folder path from a request: segments trimmed, each 1 to 128 characters with no
 * control characters, at most eight deep. Null unfiles; undefined means invalid.
 */
function folderPath(value: unknown): string[] | null | undefined {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length > MAX_FOLDER_DEPTH) {
    return undefined;
  }
  const segments: string[] = [];
  for (const segment of value) {
    if (typeof segment !== 'string') {
      return undefined;
    }
    const trimmed = segment.trim();
    // eslint-disable-next-line no-control-regex
    if (!trimmed || trimmed.length > MAX_FOLDER_CHARS || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      return undefined;
    }
    segments.push(trimmed);
  }
  return segments.length ? segments : null;
}

/** OPML folders are third-party input, so they get the same limits as user edits. */
function importedFolder(folder: string[] | undefined): string[] | undefined {
  const path = folderPath(folder?.map((segment) => segment.slice(0, MAX_FOLDER_CHARS)));
  return path ?? undefined;
}

/** A subscription's own folder, else its catalogue category, for OPML export. */
function exportFolder(subscription: FeedSubscriptionWithFeed): { folder?: string[] } {
  if (subscription.folder?.length) {
    return { folder: subscription.folder };
  }
  const category = subscription.feed?.catalogueCategory;
  return category ? { folder: [category] } : {};
}

function fail(res: Response, context: string, error: unknown): void {
  logger.error(`[research] ${context}`, error);
  res.status(500).json({ error_code: 'research_unavailable' });
}

/**
 * HTTP handlers for feed subscriptions, OPML, item history and the catalogue (design
 * 5.6). Subscription reads and writes are scoped to `req.user`; feeds themselves are
 * shared public RSS, so only their public fields leave the server.
 */
export function createFeedHandlers(deps: {
  methods: FeedHandlerMethods;
  now?: () => Date;
}): FeedHandlers {
  const { methods } = deps;
  const now = deps.now ?? (() => new Date());

  /** Runs a handler when research is on for the caller; maps failures to a safe code. */
  function guarded(
    context: string,
    handler: (
      req: FeedRequest,
      res: Response,
      config: TResearchConfig,
      userId: string,
    ) => Promise<void>,
  ): (req: Request, res: Response) => Promise<void> {
    return async (req, res) => {
      const request = req as FeedRequest;
      const config = request.config?.research ?? getResearchConfig();
      const userId = request.user?.id;
      if (!config?.enabled || !userId) {
        res.status(403).json({ error_code: 'research_disabled' });
        return;
      }
      try {
        await handler(request, res, config, String(userId));
      } catch (error) {
        fail(res, context, error);
      }
    };
  }

  const listSubscriptions = guarded('Failed to list feeds', async (_req, res, config, userId) => {
    const subscriptions = await methods.getFeedSubscriptions(userId);
    res.json({
      subscriptions: subscriptions.map(toSubscriptionResponse),
      maxPerUser: config.feeds.maxPerUser,
    });
  });

  const unsubscribe = guarded('Failed to unsubscribe', async (req, res, _config, userId) => {
    const removed = await methods.unsubscribeFromFeed(userId, String(req.params.feedId));
    if (!removed) {
      res.status(404).json({ error_code: 'research_feed_not_found' });
      return;
    }
    res.json({ feedId: req.params.feedId });
  });

  const importOpml = guarded('Failed to import OPML', async (req, res, config, userId) => {
    const text = (req.body as { opml?: unknown } | undefined)?.opml;
    if (typeof text === 'string' && text.length > MAX_OPML_CHARS) {
      res.status(413).json({ error_code: 'research_opml_too_large' });
      return;
    }
    let feeds: ReturnType<typeof parseOpml>;
    try {
      feeds = typeof text === 'string' ? parseOpml(text) : [];
    } catch {
      feeds = [];
    }
    if (feeds.length === 0) {
      res.status(400).json({ error_code: 'research_opml_invalid' });
      return;
    }
    const maxPerUser = config.feeds.maxPerUser;
    const current = await methods.getFeedSubscriptions(userId);
    const followed = new Map(
      current.filter((s) => s.feed?.url).map((s) => [s.feed?.url as string, s]),
    );
    let room = Math.max(0, maxPerUser - current.length);
    const result: TOpmlImportResult = { added: 0, existing: 0, overLimit: 0, maxPerUser };
    for (const entry of feeds) {
      const folder = importedFolder(entry.folder);
      const existing = followed.get(entry.url);
      if (existing) {
        /** Re-importing files an unfiled feed without counting against the cap. */
        if (folder && !existing.folder?.length) {
          await methods.setFeedSubscriptionFolder(userId, existing.feedId, folder);
        }
        result.existing += 1;
        continue;
      }
      if (room === 0) {
        result.overLimit += 1;
        continue;
      }
      const feed = await methods.upsertFeed({
        url: entry.url,
        ...(entry.title ? { title: entry.title.slice(0, 512) } : {}),
      });
      const created = await methods.subscribeToFeed(userId, feed.id, {
        source: 'opml',
        ...(entry.title ? { label: entry.title.slice(0, 256) } : {}),
        ...(folder ? { folder } : {}),
      });
      followed.set(entry.url, { feedId: feed.id, source: 'opml' } as FeedSubscriptionWithFeed);
      if (created) {
        result.added += 1;
        room -= 1;
      } else {
        result.existing += 1;
      }
    }
    res.json(result);
  });

  const exportOpml = guarded('Failed to export OPML', async (_req, res, _config, userId) => {
    const subscriptions = await methods.getFeedSubscriptions(userId);
    const body = buildOpml(
      subscriptions.flatMap((s) =>
        s.feed
          ? [
              {
                url: s.feed.url,
                ...((s.label ?? s.feed.title) ? { title: s.label ?? s.feed.title } : {}),
                ...exportFolder(s),
              },
            ]
          : [],
      ),
      'Research feeds',
    );
    res.setHeader('Content-Type', 'text/x-opml; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="research-feeds.opml"');
    res.send(body);
  });

  const listItems = guarded('Failed to list feed items', async (req, res, config, userId) => {
    const feedId = String(req.params.feedId);
    const subscriptions = await methods.getFeedSubscriptions(userId);
    if (!subscriptions.some((s) => s.feedId === feedId)) {
      res.status(404).json({ error_code: 'research_feed_not_found' });
      return;
    }
    const items = await methods.getFeedItems({
      feedIds: [feedId],
      since: new Date(now().getTime() - config.snapshots.retentionDays * DAY_MS),
      limit: MAX_HISTORY_ITEMS,
    });
    res.json({ feedId, items: items.map(toItemResponse) });
  });

  const listCatalogue = guarded('Failed to list the catalogue', async (_req, res) => {
    const feeds = await methods.listCatalogueFeeds();
    res.json({ feeds: feeds.map(toFeedResponse) });
  });

  const subscribeCatalogue = guarded(
    'Failed to subscribe to a catalogue feed',
    async (req, res, config, userId) => {
      const feed = await methods.getFeedById(String(req.params.feedId));
      if (!feed?.catalogue) {
        res.status(404).json({ error_code: 'research_feed_not_found' });
        return;
      }
      const subscriptions = await methods.getFeedSubscriptions(userId);
      const existing = subscriptions.find((s) => s.feedId === feed.id);
      if (existing) {
        res.json(toSubscriptionResponse(existing));
        return;
      }
      if (subscriptions.length >= config.feeds.maxPerUser) {
        res.status(409).json({ error_code: 'research_feed_limit' });
        return;
      }
      const folder = feed.catalogueCategory ? [feed.catalogueCategory] : undefined;
      await methods.subscribeToFeed(userId, feed.id, {
        source: 'catalogue',
        ...(folder ? { folder } : {}),
      });
      res.status(201).json(
        toSubscriptionResponse({
          feedId: feed.id,
          source: 'catalogue',
          ...(folder ? { folder } : {}),
          feed,
        } as FeedSubscriptionWithFeed),
      );
    },
  );

  const moveFeed = guarded('Failed to move a feed', async (req, res, _config, userId) => {
    const feedId = String(req.params.feedId);
    const folder = folderPath((req.body as { folder?: unknown } | undefined)?.folder);
    if (folder === undefined) {
      res.status(400).json({ error_code: 'research_feed_folder_invalid' });
      return;
    }
    if (!(await methods.setFeedSubscriptionFolder(userId, feedId, folder))) {
      res.status(404).json({ error_code: 'research_feed_not_found' });
      return;
    }
    res.json({ feedId, ...(folder ? { folder } : {}) });
  });

  const renameFolder = guarded('Failed to rename a folder', async (req, res, _config, userId) => {
    const body = (req.body ?? {}) as { from?: unknown; to?: unknown };
    const from = folderPath(body.from);
    const to = folderPath(body.to);
    if (!from || !to) {
      res.status(400).json({ error_code: 'research_feed_folder_invalid' });
      return;
    }
    res.json({ renamed: await methods.renameFeedFolder(userId, from, to) });
  });

  const addCatalogueFeed = guarded('Failed to add a catalogue feed', async (req, res) => {
    const body = (req.body ?? {}) as { url?: unknown; category?: unknown };
    if (!isHttpUrl(body.url)) {
      res.status(400).json({ error_code: 'research_feed_url_invalid' });
      return;
    }
    const feed = await methods.upsertFeed({ url: body.url });
    const listed = await methods.setFeedCatalogue(feed.id, {
      catalogue: true,
      ...(category(body.category) ? { category: category(body.category) } : {}),
    });
    res.status(201).json(toFeedResponse(listed ?? feed));
  });

  const updateCatalogueFeed = guarded('Failed to update a catalogue feed', async (req, res) => {
    const feedId = String(req.params.feedId);
    const body = (req.body ?? {}) as {
      catalogue?: unknown;
      category?: unknown;
      disabled?: unknown;
    };
    const feed = await methods.getFeedById(feedId);
    if (!feed) {
      res.status(404).json({ error_code: 'research_feed_not_found' });
      return;
    }
    if (typeof body.disabled === 'boolean') {
      await methods.setFeedDisabled(feedId, body.disabled);
    }
    if (typeof body.catalogue === 'boolean' || category(body.category)) {
      const listing = typeof body.catalogue === 'boolean' ? body.catalogue : feed.catalogue;
      await methods.setFeedCatalogue(feedId, {
        catalogue: listing,
        ...((category(body.category) ?? feed.catalogueCategory)
          ? { category: category(body.category) ?? feed.catalogueCategory }
          : {}),
      });
    }
    const updated = await methods.getFeedById(feedId);
    res.json(toFeedResponse(updated ?? feed));
  });

  return {
    listSubscriptions,
    unsubscribe,
    importOpml,
    exportOpml,
    listItems,
    listCatalogue,
    subscribeCatalogue,
    moveFeed,
    renameFolder,
    addCatalogueFeed,
    updateCatalogueFeed,
  };
}
