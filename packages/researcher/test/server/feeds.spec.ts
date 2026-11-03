import mongoose from 'mongoose';
import { researchSchema } from '../../src/contract/research';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { TOpmlImportResult, TResearchFeedsResponse } from '../../src/contract/types';
import type { ResearchHostMethods } from '../../src/db';
import { createResearchDbMethods, createResearchModels } from '../../src/db';
import { createFeedHandlers } from '../../src/server/feeds';
import { parseOpml } from '../../src/server/opml';

const DB_SETUP_TIMEOUT_MS = 60_000;
const DAY_MS = 24 * 3_600_000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;
const userId = new mongoose.Types.ObjectId().toString();
const otherUser = new mongoose.Types.ObjectId().toString();
const now = new Date('2026-11-03T00:00:00.000Z');

const research = researchSchema.parse({ enabled: true, feeds: { maxPerUser: 3 } });

type MockResponse = Response & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
};

function response(): MockResponse {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  };
  const res: Record<string, unknown> = state;
  res.status = jest.fn((code: number) => {
    state.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    state.body = body;
    return res;
  });
  res.send = jest.fn((body: unknown) => {
    state.body = body;
    return res;
  });
  res.setHeader = jest.fn((name: string, value: string) => {
    state.headers[name.toLowerCase()] = value;
    return res;
  });
  return res as unknown as MockResponse;
}

function req(
  input: { params?: Record<string, string>; body?: unknown; user?: string; enabled?: boolean } = {},
): Request {
  return {
    user: { id: input.user ?? userId },
    params: input.params ?? {},
    body: input.body ?? {},
    config: { researcher: input.enabled === false ? undefined : research },
  } as unknown as Request;
}

function opml(urls: string[]): string {
  const outlines = urls
    .map((url, i) => `<outline type="rss" text="Feed ${i}" xmlUrl="${url}"/>`)
    .join('');
  return `<?xml version="1.0"?><opml version="2.0"><head><title>t</title></head><body>${outlines}</body></opml>`;
}

const handlers = () => createFeedHandlers({ methods, now: () => now });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  methods = { ...createMethods(mongoose), ...createResearchDbMethods(mongoose) };
  await Promise.all(['Feed', 'FeedSubscription', 'FeedItem'].map((m) => mongoose.models[m].init()));
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await Promise.all(
    ['Feed', 'FeedSubscription', 'FeedItem'].map((m) => mongoose.models[m].deleteMany({})),
  );
});

describe('createFeedHandlers', () => {
  it('refuses every route when research is disabled', async () => {
    const res = response();
    await handlers().listSubscriptions(req({ enabled: false }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error_code: 'research_disabled' });
  });

  it('imports OPML up to the per-user cap and reports what was left out', async () => {
    const res = response();
    await handlers().importOpml(
      req({
        body: {
          opml: opml([
            'https://a.example/rss',
            'https://b.example/rss',
            'https://c.example/rss',
            'https://d.example/rss',
          ]),
        },
      }),
      res,
    );
    expect(res.body).toEqual<TOpmlImportResult>({
      added: 3,
      existing: 0,
      overLimit: 1,
      maxPerUser: 3,
    });
    expect(await methods.countFeedSubscriptions(userId)).toBe(3);
    expect(await mongoose.models.Feed.countDocuments({ url: 'https://d.example/rss' })).toBe(0);

    const again = response();
    await handlers().importOpml(req({ body: { opml: opml(['https://a.example/rss']) } }), again);
    expect(again.body).toMatchObject({ added: 0, existing: 1, overLimit: 0 });
  });

  it('rejects a document that is not OPML without subscribing anything', async () => {
    const res = response();
    await handlers().importOpml(req({ body: { opml: '<html><body>nope</body></html>' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error_code: 'research_opml_invalid' });
    expect(await methods.countFeedSubscriptions(userId)).toBe(0);
  });

  it('rejects an oversized OPML body', async () => {
    const res = response();
    await handlers().importOpml(req({ body: { opml: 'x'.repeat(1_000_001) } }), res);
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error_code: 'research_opml_too_large' });
  });

  it('lists only the caller’s subscriptions without poll internals', async () => {
    await handlers().importOpml(
      req({ body: { opml: opml(['https://a.example/rss']) } }),
      response(),
    );
    await handlers().importOpml(
      req({ user: otherUser, body: { opml: opml(['https://z.example/rss']) } }),
      response(),
    );
    await mongoose.models.Feed.updateMany({}, { $set: { etag: '"v1"', leaseBy: 'node-1' } });
    const res = response();
    await handlers().listSubscriptions(req(), res);
    const body = res.body as TResearchFeedsResponse;
    expect(body.maxPerUser).toBe(3);
    expect(body.subscriptions).toHaveLength(1);
    expect(body.subscriptions[0]).toMatchObject({
      source: 'opml',
      label: 'Feed 0',
      feed: { url: 'https://a.example/rss', disabled: false, catalogue: false },
    });
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('etag');
    expect(serialised).not.toContain('node-1');
    expect(serialised).not.toContain('subscriberCount');
  });

  it('exports the caller’s subscriptions as OPML that imports back', async () => {
    const urls = ['https://a.example/rss', 'https://b.example/rss?x=1&y=2'];
    await handlers().importOpml(req({ body: { opml: opml(urls) } }), response());
    const res = response();
    await handlers().exportOpml(req(), res);
    expect(res.headers['content-type']).toContain('text/x-opml');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(parseOpml(res.body as string).map((f) => f.url)).toEqual(urls);
  });

  it('unsubscribes and answers 404 for a feed the caller does not follow', async () => {
    await handlers().importOpml(
      req({ body: { opml: opml(['https://a.example/rss']) } }),
      response(),
    );
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss' });

    const missing = response();
    await handlers().unsubscribe(req({ user: otherUser, params: { feedId: feed.id } }), missing);
    expect(missing.statusCode).toBe(404);

    const res = response();
    await handlers().unsubscribe(req({ params: { feedId: feed.id } }), res);
    expect(res.statusCode).toBe(200);
    expect(await methods.countFeedSubscriptions(userId)).toBe(0);
    expect((await methods.getFeedById(feed.id))?.subscriberCount).toBe(0);
  });

  it('subscribes to catalogue feeds only, within the cap', async () => {
    const listed = await methods.upsertFeed({ url: 'https://cat.example/rss' });
    await methods.setFeedCatalogue(listed.id, { catalogue: true, category: 'Tax' });
    const unlisted = await methods.upsertFeed({ url: 'https://private.example/rss' });

    const refused = response();
    await handlers().subscribeCatalogue(req({ params: { feedId: unlisted.id } }), refused);
    expect(refused.statusCode).toBe(404);

    const res = response();
    await handlers().subscribeCatalogue(req({ params: { feedId: listed.id } }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ feedId: listed.id, source: 'catalogue' });

    await handlers().importOpml(
      req({
        user: otherUser,
        body: { opml: opml(['https://1.example/r', 'https://2.example/r', 'https://3.example/r']) },
      }),
      response(),
    );
    const full = response();
    await handlers().subscribeCatalogue(
      req({ user: otherUser, params: { feedId: listed.id } }),
      full,
    );
    expect(full.statusCode).toBe(409);
    expect(full.body).toEqual({ error_code: 'research_feed_limit' });
  });

  it('lists the catalogue grouped data for the picker', async () => {
    const feed = await methods.upsertFeed({ url: 'https://cat.example/rss', title: 'Cat' });
    await methods.setFeedCatalogue(feed.id, { catalogue: true, category: 'Tax' });
    await methods.upsertFeed({ url: 'https://other.example/rss' });
    const res = response();
    await handlers().listCatalogue(req(), res);
    expect(res.body).toEqual({
      feeds: [
        expect.objectContaining({
          id: feed.id,
          title: 'Cat',
          catalogue: true,
          catalogueCategory: 'Tax',
        }),
      ],
    });
  });

  it('shows a subscribed feed’s item history within the retention window', async () => {
    await handlers().importOpml(
      req({ body: { opml: opml(['https://a.example/rss']) } }),
      response(),
    );
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss' });
    await methods.insertFeedItem({
      feedId: feed.id,
      guid: 'recent',
      title: 'Recent',
      publishedAt: new Date(now.getTime() - DAY_MS),
      snapshotId: 's1',
    });
    await methods.insertFeedItem({
      feedId: feed.id,
      guid: 'stale',
      publishedAt: new Date(now.getTime() - 50 * DAY_MS),
      snapshotId: 's2',
    });

    const res = response();
    await handlers().listItems(req({ params: { feedId: feed.id } }), res);
    expect(res.body).toEqual({
      feedId: feed.id,
      items: [
        {
          guid: 'recent',
          title: 'Recent',
          publishedAt: new Date(now.getTime() - DAY_MS).toISOString(),
          archived: false,
        },
      ],
    });

    const stranger = response();
    await handlers().listItems(req({ user: otherUser, params: { feedId: feed.id } }), stranger);
    expect(stranger.statusCode).toBe(404);
  });

  it('drops non-http links that a hostile feed supplies', async () => {
    await handlers().importOpml(
      req({ body: { opml: opml(['https://a.example/rss']) } }),
      response(),
    );
    const feed = await methods.upsertFeed({ url: 'https://a.example/rss' });
    await mongoose.models.Feed.updateOne(
      { id: feed.id },
      { $set: { siteUrl: 'javascript:alert(document.cookie)' } },
    );
    for (const [guid, link] of [
      ['js', 'javascript:alert(1)'],
      ['data', 'data:text/html,<script>alert(1)</script>'],
      ['ok', 'https://a.example/ok'],
    ]) {
      await methods.insertFeedItem({
        feedId: feed.id,
        guid,
        link,
        publishedAt: new Date(now.getTime() - DAY_MS),
        snapshotId: `s-${guid}`,
      });
    }
    const items = response();
    await handlers().listItems(req({ params: { feedId: feed.id } }), items);
    const links = Object.fromEntries(
      (items.body as { items: Array<{ guid: string; link?: string }> }).items.map((i) => [
        i.guid,
        i.link,
      ]),
    );
    expect(links).toEqual({ js: undefined, data: undefined, ok: 'https://a.example/ok' });

    const list = response();
    await handlers().listSubscriptions(req(), list);
    expect(JSON.stringify(list.body)).not.toContain('javascript:');
  });

  describe('folders', () => {
    const foldered = `<opml version="2.0"><body>
      <outline text="AI"><outline text="Agents">
        <outline type="rss" text="Deep" xmlUrl="https://deep.example/rss"/>
      </outline></outline>
      <outline text="Cyber"><outline type="rss" text="Sec" xmlUrl="https://sec.example/rss"/></outline>
    </body></opml>`;

    const listed = async (user = userId) => {
      const res = response();
      await handlers().listSubscriptions(req({ user }), res);
      return Object.fromEntries(
        (res.body as TResearchFeedsResponse).subscriptions.map((s) => [s.feed?.url, s.folder]),
      );
    };

    it('keeps OPML folders on import and writes them back on export', async () => {
      await handlers().importOpml(req({ body: { opml: foldered } }), response());
      expect(await listed()).toEqual({
        'https://deep.example/rss': ['AI', 'Agents'],
        'https://sec.example/rss': ['Cyber'],
      });
      const res = response();
      await handlers().exportOpml(req(), res);
      expect(parseOpml(res.body as string).map((f) => [f.url, f.folder])).toEqual(
        expect.arrayContaining([
          ['https://deep.example/rss', ['AI', 'Agents']],
          ['https://sec.example/rss', ['Cyber']],
        ]),
      );
    });

    it('files feeds the user already follows when the same OPML is imported again', async () => {
      await handlers().importOpml(
        req({ body: { opml: opml(['https://deep.example/rss', 'https://sec.example/rss']) } }),
        response(),
      );
      expect(await listed()).toEqual({
        'https://deep.example/rss': undefined,
        'https://sec.example/rss': undefined,
      });
      const res = response();
      await handlers().importOpml(req({ body: { opml: foldered } }), res);
      expect(res.body).toMatchObject({ added: 0, existing: 2, overLimit: 0 });
      expect(await listed()).toEqual({
        'https://deep.example/rss': ['AI', 'Agents'],
        'https://sec.example/rss': ['Cyber'],
      });
    });

    it('files a catalogue subscription under its category', async () => {
      const feed = await methods.upsertFeed({ url: 'https://cat.example/rss' });
      await methods.setFeedCatalogue(feed.id, { catalogue: true, category: 'Tax' });
      await handlers().subscribeCatalogue(req({ params: { feedId: feed.id } }), response());
      expect((await listed())['https://cat.example/rss']).toEqual(['Tax']);
    });

    it('moves a feed into a folder, out of folders, and refuses a bad folder', async () => {
      await handlers().importOpml(req({ body: { opml: foldered } }), response());
      const feed = await methods.upsertFeed({ url: 'https://sec.example/rss' });

      const moved = response();
      await handlers().moveFeed(
        req({ params: { feedId: feed.id }, body: { folder: [' Security ', 'Daily'] } }),
        moved,
      );
      expect(moved.body).toMatchObject({ feedId: feed.id, folder: ['Security', 'Daily'] });

      const unfiled = response();
      await handlers().moveFeed(
        req({ params: { feedId: feed.id }, body: { folder: null } }),
        unfiled,
      );
      expect((await listed())['https://sec.example/rss']).toBeUndefined();

      for (const folder of ['flat string', [''], ['x'.repeat(129)], Array(9).fill('a'), [3]]) {
        const bad = response();
        await handlers().moveFeed(req({ params: { feedId: feed.id }, body: { folder } }), bad);
        expect(bad.statusCode).toBe(400);
        expect(bad.body).toEqual({ error_code: 'research_feed_folder_invalid' });
      }

      const stranger = response();
      await handlers().moveFeed(
        req({ user: otherUser, params: { feedId: feed.id }, body: { folder: ['X'] } }),
        stranger,
      );
      expect(stranger.statusCode).toBe(404);
    });

    it('renames a folder and its subfolders', async () => {
      await handlers().importOpml(req({ body: { opml: foldered } }), response());
      const res = response();
      await handlers().renameFolder(
        req({ body: { from: ['AI'], to: ['Artificial Intelligence'] } }),
        res,
      );
      expect(res.body).toEqual({ renamed: 1 });
      expect((await listed())['https://deep.example/rss']).toEqual([
        'Artificial Intelligence',
        'Agents',
      ]);
      const bad = response();
      await handlers().renameFolder(req({ body: { from: [], to: ['X'] } }), bad);
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('catalogue management', () => {
    it('adds a feed URL to the catalogue under a category', async () => {
      const res = response();
      await handlers().addCatalogueFeed(
        req({ body: { url: 'https://new.example/rss', category: 'Audit' } }),
        res,
      );
      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({
        url: 'https://new.example/rss',
        catalogue: true,
        catalogueCategory: 'Audit',
      });
    });

    it('rejects a feed URL that is not http(s)', async () => {
      for (const url of ['file:///etc/passwd', 'not a url', '']) {
        const res = response();
        await handlers().addCatalogueFeed(req({ body: { url } }), res);
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error_code: 'research_feed_url_invalid' });
      }
    });

    it('delists and re-enables a feed', async () => {
      const feed = await methods.upsertFeed({ url: 'https://cat.example/rss' });
      await methods.setFeedCatalogue(feed.id, { catalogue: true, category: 'Tax' });
      await methods.setFeedDisabled(feed.id, true);
      const res = response();
      await handlers().updateCatalogueFeed(
        req({ params: { feedId: feed.id }, body: { catalogue: false, disabled: false } }),
        res,
      );
      expect(res.body).toMatchObject({ id: feed.id, catalogue: false, disabled: false });

      const missing = response();
      await handlers().updateCatalogueFeed(
        req({ params: { feedId: 'feed_missing' }, body: { catalogue: true } }),
        missing,
      );
      expect(missing.statusCode).toBe(404);
    });
  });
});
