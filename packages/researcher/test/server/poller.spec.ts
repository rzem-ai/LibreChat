import http from 'node:http';
import mongoose from 'mongoose';
import { researchSchema } from '../../src/contract/research';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { AddressInfo } from 'node:net';
import type { SnapshotStorage } from '../../src/server/snapshots';
import type { ResearchHostMethods } from '../../src/db';
import { createResearchDbMethods, createResearchModels } from '../../src/db';
import { createSnapshotRecorder } from '../../src/server/snapshots';
import { createSafePageFetcher } from '../../src/server/fetch';
import { createFeedPoller } from '../../src/server/poller';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;
let server: http.Server;
let origin: string;
let allowed: string[];
const hits = new Map<string, number>();
const objects = new Map<string, string>();

const storage: SnapshotStorage = {
  save: async ({ key, markdown }) => {
    objects.set(key, markdown);
    return { storageKey: key, fileStrategy: 'memory' };
  },
  read: async (s) => objects.get(s.storageKey) ?? null,
  remove: async () => undefined,
};

const longText = 'Widgets grew strongly this quarter according to the bureau. '.repeat(8);

function rss(origin: string) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture Feed</title><link>${origin}/</link>
<item><guid>full</guid><title>Full item</title><link>${origin}/full</link><pubDate>Mon, 02 Nov 2026 09:00:00 GMT</pubDate>
<description><![CDATA[<p>${longText}</p>]]></description></item>
<item><guid>thin</guid><title>Thin item</title><link>${origin}/article</link><pubDate>Sun, 01 Nov 2026 09:00:00 GMT</pubDate>
<description>Short</description></item>
</channel></rss>`;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  methods = { ...createMethods(mongoose), ...createResearchDbMethods(mongoose) };
  await Promise.all(
    ['Feed', 'FeedSubscription', 'FeedItem', 'Snapshot'].map((m) => mongoose.models[m].init()),
  );

  server = http.createServer((req, res) => {
    hits.set(req.url ?? '', (hits.get(req.url ?? '') ?? 0) + 1);
    if (req.url === '/feed.xml') {
      if (req.headers['if-none-match'] === '"v1"') {
        res.writeHead(304);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/rss+xml', ETag: '"v1"' });
      res.end(rss(origin));
      return;
    }
    if (req.url === '/many.xml') {
      const items = Array.from(
        { length: 12 },
        (_, i) =>
          `<item><guid>t${i}</guid><title>Teaser ${i}</title><link>${origin}/a/${i}</link><description>Short</description></item>`,
      ).join('');
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      res.end(
        `<?xml version="1.0"?><rss version="2.0"><channel><title>Many</title>${items}</channel></rss>`,
      );
      return;
    }
    if (req.url?.startsWith('/a/')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><main><p>Article body for a teaser.</p></main></body></html>');
      return;
    }
    if (req.url === '/article') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><head><title>Article</title></head><body><main><p>Fetched article body.</p></main></body></html>',
      );
      return;
    }
    res.writeHead(500);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  allowed = [`127.0.0.1:${port}`];
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await Promise.all(
    ['Feed', 'FeedSubscription', 'FeedItem', 'Snapshot'].map((m) =>
      mongoose.models[m].deleteMany({}),
    ),
  );
  hits.clear();
  objects.clear();
});

function poller(now = new Date('2026-11-03T00:00:00.000Z')) {
  return createFeedPoller({
    methods,
    getConfig: async () =>
      researchSchema.parse({ enabled: true, feeds: { disableAfterFailures: 2 } }),
    fetcher: createSafePageFetcher({
      maxBytes: 1_000_000,
      timeoutMs: 5000,
      maxRedirects: 2,
      allowedAddresses: allowed,
    }),
    recorder: createSnapshotRecorder({ methods, storage }),
    instanceId: 'test',
    now: () => now,
  });
}

async function subscribe(url: string, users: number) {
  const feed = await methods.upsertFeed({ url });
  for (let i = 0; i < users; i++) {
    await methods.subscribeToFeed(new mongoose.Types.ObjectId().toString(), feed.id, {
      source: 'opml',
    });
  }
  return feed;
}

describe('createFeedPoller', () => {
  it('polls a feed once for all its subscribers and stores items as shared snapshots', async () => {
    const feed = await subscribe(`${origin}/feed.xml`, 50);
    expect(await poller().pollOnce()).toBe(1);
    expect(hits.get('/feed.xml')).toBe(1);

    const items = await methods.getFeedItems({ feedIds: [feed.id], limit: 10 });
    expect(items.map((i) => i.guid).sort()).toEqual(['full', 'thin']);
    const snapshots = await methods.getSnapshotsByIds(items.map((i) => i.snapshotId));
    expect(
      snapshots.every((s) => s.user == null && s.sourceKind === 'rss' && s.feedId === feed.id),
    ).toBe(true);
    const updated = await methods.getFeedById(feed.id);
    expect(updated).toMatchObject({ title: 'Fixture Feed', etag: '"v1"', lastStatus: 'ok' });
  });

  it('uses feed content when present and fetches the page for thin items', async () => {
    const feed = await subscribe(`${origin}/feed.xml`, 1);
    await poller().pollOnce();
    const items = await methods.getFeedItems({ feedIds: [feed.id], limit: 10 });
    const bodies = Object.fromEntries(
      await Promise.all(
        items.map(async (item) => {
          const [snapshot] = await methods.getSnapshotsByIds([item.snapshotId]);
          return [item.guid, objects.get(snapshot.storageKey)];
        }),
      ),
    );
    expect(bodies.full).toContain('Widgets grew strongly');
    expect(bodies.thin).toContain('Fetched article body.');
    expect(hits.get('/article')).toBe(1);
    expect(hits.get('/full')).toBeUndefined();
  });

  it('sends the stored ETag and records an unchanged feed without new items', async () => {
    const feed = await subscribe(`${origin}/feed.xml`, 1);
    await poller().pollOnce();
    await mongoose.models.Feed.updateOne({ id: feed.id }, { $set: { nextPollAt: new Date(0) } });
    await poller().pollOnce();
    expect((await methods.getFeedById(feed.id))?.lastStatus).toBe('not_modified');
    expect(await mongoose.models.FeedItem.countDocuments()).toBe(2);
  });

  it('backs off after a failure and disables the feed at the limit', async () => {
    const now = new Date('2026-11-03T00:00:00.000Z');
    const feed = await subscribe(`${origin}/broken.xml`, 1);
    await poller(now).pollOnce();
    const failed = await methods.getFeedById(feed.id);
    expect(failed).toMatchObject({
      consecutiveFailures: 1,
      lastStatus: 'error',
      lastError: 'fetch_status',
    });
    expect(new Date(failed!.nextPollAt!).getTime()).toBeGreaterThan(now.getTime() + 30 * 60_000);

    await mongoose.models.Feed.updateOne({ id: feed.id }, { $set: { nextPollAt: new Date(0) } });
    await poller(now).pollOnce();
    expect((await methods.getFeedById(feed.id))?.disabled).toBe(true);
    const subscription = await mongoose.models.FeedSubscription.findOne({ feedId: feed.id })
      .lean<{ user: mongoose.Types.ObjectId }>()
      .exec();
    expect(await methods.countFeedSubscriptions(subscription!.user)).toBe(1);
  });

  it('fetches at most ten item pages per poll so a poll fits its lease', async () => {
    const feed = await subscribe(`${origin}/many.xml`, 1);
    await poller().pollOnce();
    const pageHits = [...hits.entries()]
      .filter(([url]) => url.startsWith('/a/'))
      .reduce((total, [, count]) => total + count, 0);
    expect(pageHits).toBe(10);
    expect((await methods.getFeedItems({ feedIds: [feed.id], limit: 50 })).length).toBe(12);
  });

  it('skips feeds nobody subscribes to', async () => {
    await methods.upsertFeed({ url: `${origin}/feed.xml` });
    expect(await poller().pollOnce()).toBe(0);
    expect(hits.size).toBe(0);
  });
});
