import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createFeedMethods, type FeedMethods } from '../../../src/db/methods/feeds';
import { createResearchModels } from '../../../src/db';

const DB_SETUP_TIMEOUT_MS = 60_000;
let mongoServer: MongoMemoryServer;
let methods: FeedMethods;
const alice = new mongoose.Types.ObjectId().toString();
const bob = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  await mongoose.models.Feed.init();
  await mongoose.models.FeedSubscription.init();
  await mongoose.models.FeedItem.init();
  methods = createFeedMethods(mongoose);
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await mongoose.models.Feed.deleteMany({});
  await mongoose.models.FeedSubscription.deleteMany({});
  await mongoose.models.FeedItem.deleteMany({});
});

describe('feeds and subscriptions', () => {
  it('keeps one feed per url however many users add it', async () => {
    const a = await methods.upsertFeed({ url: 'https://example.com/rss', title: 'Example' });
    const b = await methods.upsertFeed({ url: 'https://example.com/rss' });
    expect(b.id).toBe(a.id);
    expect(await mongoose.models.Feed.countDocuments()).toBe(1);
  });

  it('subscribes once per user and tracks the subscriber count', async () => {
    const feed = await methods.upsertFeed({ url: 'https://example.com/rss' });
    expect(await methods.subscribeToFeed(alice, feed.id, { source: 'opml' })).toBe(true);
    expect(await methods.subscribeToFeed(alice, feed.id, { source: 'opml' })).toBe(false);
    await methods.subscribeToFeed(bob, feed.id, { source: 'catalogue', label: 'Bob label' });
    expect((await methods.getFeedById(feed.id))?.subscriberCount).toBe(2);
    expect(await methods.countFeedSubscriptions(alice)).toBe(1);

    expect(await methods.unsubscribeFromFeed(alice, feed.id)).toBe(true);
    expect(await methods.unsubscribeFromFeed(alice, feed.id)).toBe(false);
    expect((await methods.getFeedById(feed.id))?.subscriberCount).toBe(1);
  });

  it("lists a user's subscriptions with their feeds", async () => {
    const feed = await methods.upsertFeed({ url: 'https://example.com/rss', title: 'Example' });
    await methods.subscribeToFeed(alice, feed.id, { source: 'opml', label: 'Mine' });
    const subscriptions = await methods.getFeedSubscriptions(alice);
    expect(subscriptions).toEqual([
      expect.objectContaining({ feedId: feed.id, label: 'Mine', source: 'opml' }),
    ]);
    expect(subscriptions[0].feed).toMatchObject({
      url: 'https://example.com/rss',
      title: 'Example',
    });
    expect(await methods.getFeedSubscriptions(bob)).toEqual([]);
  });
});

describe('polling leases', () => {
  it('claims only due, enabled feeds that someone subscribes to, one replica at a time', async () => {
    const now = new Date('2026-11-03T00:00:00.000Z');
    const due = await methods.upsertFeed({ url: 'https://a.example/rss' });
    const orphan = await methods.upsertFeed({ url: 'https://b.example/rss' });
    const disabled = await methods.upsertFeed({ url: 'https://c.example/rss' });
    await methods.subscribeToFeed(alice, due.id, { source: 'opml' });
    await methods.subscribeToFeed(alice, disabled.id, { source: 'opml' });
    await mongoose.models.Feed.updateOne({ id: disabled.id }, { $set: { disabled: true } });

    const first = await methods.claimFeedForPoll({ instanceId: 'a', leaseMs: 60_000, now });
    expect(first?.id).toBe(due.id);
    expect(await methods.claimFeedForPoll({ instanceId: 'b', leaseMs: 60_000, now })).toBeNull();
    expect(orphan.subscriberCount).toBe(0);
  });

  it('records success, schedules the next poll and releases the lease', async () => {
    const now = new Date('2026-11-03T00:00:00.000Z');
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss' });
    await methods.subscribeToFeed(alice, feed.id, { source: 'opml' });
    await methods.claimFeedForPoll({ instanceId: 'a', leaseMs: 60_000, now });
    await methods.recordFeedPoll(feed.id, 'a', {
      ok: true,
      status: 'ok',
      etag: '"v1"',
      title: 'Feed A',
      nextPollAt: new Date(now.getTime() + 30 * 60_000),
      disableAfterFailures: 3,
    });
    const after = await methods.getFeedById(feed.id);
    expect(after).toMatchObject({
      etag: '"v1"',
      title: 'Feed A',
      consecutiveFailures: 0,
      lastStatus: 'ok',
    });
    expect(after?.leaseBy).toBeUndefined();
    expect(await methods.claimFeedForPoll({ instanceId: 'a', leaseMs: 60_000, now })).toBeNull();
  });

  it('disables a feed after repeated failures but keeps its subscriptions', async () => {
    const now = new Date('2026-11-03T00:00:00.000Z');
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss' });
    await methods.subscribeToFeed(alice, feed.id, { source: 'opml' });
    for (let i = 0; i < 3; i++) {
      await methods.recordFeedPoll(feed.id, 'a', {
        ok: false,
        status: 'error',
        error: 'fetch_status',
        nextPollAt: now,
        disableAfterFailures: 3,
      });
    }
    const after = await methods.getFeedById(feed.id);
    expect(after).toMatchObject({
      disabled: true,
      consecutiveFailures: 3,
      lastError: 'fetch_status',
    });
    expect(await methods.countFeedSubscriptions(alice)).toBe(1);
    await methods.setFeedDisabled(feed.id, false);
    expect((await methods.getFeedById(feed.id))?.disabled).toBe(false);
  });
});

describe('feed items', () => {
  it('stores each guid once per feed and reports which guids are new', async () => {
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss' });
    const item = {
      feedId: feed.id,
      guid: 'g1',
      link: 'https://a.example/1',
      title: 'One',
      publishedAt: new Date(),
      snapshotId: 's1',
    };
    expect(await methods.insertFeedItem(item)).not.toBeNull();
    expect(await methods.insertFeedItem(item)).toBeNull();
    expect(await methods.findKnownFeedGuids(feed.id, ['g1', 'g2'])).toEqual(['g1']);
  });

  it('returns recent items for given feeds, newest first and capped', async () => {
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss' });
    const day = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 4; i++) {
      await methods.insertFeedItem({
        feedId: feed.id,
        guid: `g${i}`,
        link: `https://a.example/${i}`,
        title: `Item ${i}`,
        publishedAt: new Date(Date.UTC(2026, 10, 1) + i * day),
        snapshotId: `s${i}`,
      });
    }
    const items = await methods.getFeedItems({
      feedIds: [feed.id],
      since: new Date(Date.UTC(2026, 10, 2)),
      limit: 2,
    });
    expect(items.map((i) => i.guid)).toEqual(['g3', 'g2']);
  });

  it('archives items whose snapshots were cited and keeps them through expiry', async () => {
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss' });
    const old = new Date('2026-08-01T00:00:00.000Z');
    await methods.insertFeedItem({
      feedId: feed.id,
      guid: 'cited',
      link: 'l',
      title: 't',
      publishedAt: old,
      snapshotId: 's-cited',
    });
    await methods.insertFeedItem({
      feedId: feed.id,
      guid: 'stale',
      link: 'l',
      title: 't',
      publishedAt: old,
      snapshotId: 's-stale',
    });
    expect(await methods.archiveFeedItemsBySnapshot(['s-cited'])).toBe(1);
    const removed = await methods.deleteExpiredFeedItems(new Date('2026-09-15T00:00:00.000Z'));
    expect(removed).toBe(1);
    expect(await methods.findKnownFeedGuids(feed.id, ['cited', 'stale'])).toEqual(['cited']);
  });
});

describe('catalogue', () => {
  it('lists catalogue feeds by category and lets an admin curate them', async () => {
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss', title: 'A' });
    await methods.upsertFeed({ url: 'https://b.example/rss' });
    await methods.setFeedCatalogue(feed.id, { catalogue: true, category: 'Technology' });
    const catalogue = await methods.listCatalogueFeeds();
    expect(catalogue).toEqual([
      expect.objectContaining({ id: feed.id, catalogueCategory: 'Technology' }),
    ]);
  });
});

describe('subscription folders', () => {
  async function follow(user: string, url: string, folder?: string[]) {
    const feed = await methods.upsertFeed({ url });
    await methods.subscribeToFeed(user, feed.id, { source: 'opml', ...(folder ? { folder } : {}) });
    return feed;
  }

  async function folders(user: string) {
    const subs = await methods.getFeedSubscriptions(user);
    return Object.fromEntries(subs.map((s) => [s.feed?.url, s.folder ?? null]));
  }

  it('keeps the folder path a user filed a feed under', async () => {
    await follow(alice, 'https://f1.example/rss', ['AI', 'Agents']);
    await follow(alice, 'https://f2.example/rss');
    expect(await folders(alice)).toEqual({
      'https://f1.example/rss': ['AI', 'Agents'],
      'https://f2.example/rss': null,
    });
  });

  it('moves one of the user’s feeds to another folder or out of folders', async () => {
    const feed = await follow(alice, 'https://f3.example/rss', ['Old']);
    await follow(bob, 'https://f3.example/rss', ['Bob']);
    expect(await methods.setFeedSubscriptionFolder(alice, feed.id, ['New', 'Sub'])).toBe(true);
    expect((await folders(alice))['https://f3.example/rss']).toEqual(['New', 'Sub']);
    expect(await methods.setFeedSubscriptionFolder(alice, feed.id, null)).toBe(true);
    expect((await folders(alice))['https://f3.example/rss']).toBeNull();
    expect((await folders(bob))['https://f3.example/rss']).toEqual(['Bob']);
    expect(await methods.setFeedSubscriptionFolder(alice, 'feed_missing', ['X'])).toBe(false);
  });

  it('renames a folder and everything under it, for that user only', async () => {
    await follow(alice, 'https://r1.example/rss', ['AI']);
    await follow(alice, 'https://r2.example/rss', ['AI', 'Agents']);
    await follow(alice, 'https://r3.example/rss', ['AIX']);
    await follow(bob, 'https://r4.example/rss', ['AI']);
    expect(await methods.renameFeedFolder(alice, ['AI'], ['Artificial Intelligence'])).toBe(2);
    expect(await folders(alice)).toMatchObject({
      'https://r1.example/rss': ['Artificial Intelligence'],
      'https://r2.example/rss': ['Artificial Intelligence', 'Agents'],
      'https://r3.example/rss': ['AIX'],
    });
    expect((await folders(bob))['https://r4.example/rss']).toEqual(['AI']);
  });
});
