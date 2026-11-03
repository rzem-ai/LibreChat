import mongoose from 'mongoose';
import { researchSchema } from '../../src/contract/research';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RESEARCH_TOOL_NAMES } from '../../src/contract/research';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { IResearchJob, ResearchHostMethods } from '../../src/db';
import type { DocumentGateway } from '../../src/server/documents';
import type { SnapshotStorage } from '../../src/server/snapshots';
import type { UploadSearch } from '../../src/server/uploads';
import type { SearchClient } from '../../src/server/search';
import type { PageFetcher } from '../../src/server/fetch';
import { ResearchJobType, RESEARCH_AGENT_IDS } from '../../src/contract/types';
import { createResearchDbMethods, createResearchModels } from '../../src/db';
import { createSnapshotRecorder } from '../../src/server/snapshots';
import { createResearchTools } from '../../src/server/tools';
import { PageFetchError } from '../../src/server/fetch';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;
const objects = new Map<string, string>();
const storage: SnapshotStorage = {
  save: async ({ key, markdown }) => {
    objects.set(key, markdown);
    return { storageKey: key, fileStrategy: 'memory' };
  },
  read: async (s) => objects.get(s.storageKey) ?? null,
  remove: async (s) => {
    objects.delete(s.storageKey);
  },
};

const userId = new mongoose.Types.ObjectId().toString();
const otherUser = new mongoose.Types.ObjectId().toString();

const fetcher: PageFetcher = {
  fetch: async (url) => {
    if (url.includes('blocked')) {
      throw new PageFetchError('fetch_blocked', 'That address is not allowed.');
    }
    return {
      finalUrl: url,
      status: 200,
      contentType: 'text/html',
      body: '<html><head><title>Widgets</title></head><body><main><p>Widgets grew 4%. <a href="/next">More</a></p></main></body></html>',
    };
  },
};
const search: SearchClient = {
  search: async (query) => [{ title: `About ${query}`, url: 'https://example.com/r' }],
};
const documents: DocumentGateway = {
  fetchDocument: async ({ reference }) => ({
    text: '# Scope\nMust export CSV.',
    title: 'Spec',
    siteId: 's',
    driveId: 'd',
    itemId: reference,
    sections: [],
  }),
};
const uploads: UploadSearch = {
  search: async ({ fileIds }) =>
    fileIds.map((fileId) => ({
      fileId,
      filename: 'a.pdf',
      page: 3,
      content: 'Chunk text',
      distance: 0.1,
    })),
};

let config = researchSchema.parse({ enabled: true });

async function createJob(overrides: Partial<IResearchJob> = {}): Promise<IResearchJob> {
  return methods.createResearchJob({
    id: `research_${Math.random().toString(36).slice(2)}`,
    user: userId as unknown as IResearchJob['user'],
    agentId: RESEARCH_AGENT_IDS[ResearchJobType.CURRENT_EVENTS],
    jobType: ResearchJobType.CURRENT_EVENTS,
    invocationMode: 'interactive',
    status: 'researching',
    prompt: 'Find a solution',
    budget: { wallClockMinutes: 60, maxSteps: 500 },
    conversationId: 'c1',
    documentReferences: ['item-1', 'item-2', 'item-7', 'i'],
    startedAt: new Date(),
    ...overrides,
  });
}

const internal = {
  agentId: RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION],
  jobType: ResearchJobType.SOLUTION,
};

function tools(
  overrides: { isLiveRequest?: boolean; userId?: string; detachedDocuments?: boolean } = {},
) {
  const list = createResearchTools(
    {
      userId: overrides.userId ?? userId,
      conversationId: 'c1',
      isLiveRequest: overrides.isLiveRequest ?? false,
    },
    {
      methods,
      config,
      recorder: createSnapshotRecorder({ methods, storage }),
      fetcher,
      search,
      documents,
      uploads,
      detachedDocuments: overrides.detachedDocuments,
    },
  );
  const byName = new Map(list.map((t) => [t.name, t]));
  return async (name: string, args: Record<string, unknown>): Promise<string> =>
    String(await byName.get(name)!.invoke(args));
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  methods = { ...createMethods(mongoose), ...createResearchDbMethods(mongoose) };
  await mongoose.models.ResearchJob.init();
  await mongoose.models.Snapshot.init();
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await mongoose.models.ResearchJob.deleteMany({});
  await mongoose.models.Snapshot.deleteMany({});
  await mongoose.models.Feed.deleteMany({});
  await mongoose.models.FeedSubscription.deleteMany({});
  await mongoose.models.FeedItem.deleteMany({});
  objects.clear();
  config = researchSchema.parse({ enabled: true });
});

describe('research tools', () => {
  it('exposes the module-owned tool set', () => {
    const names = createResearchTools(
      { userId, conversationId: 'c1', isLiveRequest: true },
      { methods, config, recorder: createSnapshotRecorder({ methods, storage }), fetcher },
    ).map((t) => t.name);
    expect(names.sort()).toEqual(Object.values(RESEARCH_TOOL_NAMES).sort());
  });

  it('refuses to act when no research job runs in the conversation', async () => {
    const call = tools();
    expect(await call('fetch_page', { url: 'https://example.com/a' })).toContain('no_research_job');
  });

  it("never acts on another user's job", async () => {
    await createJob();
    const call = tools({ userId: otherUser });
    expect(await call('record_finding', { claim: 'x', snapshot_id: 'snap_x' })).toContain(
      'no_research_job',
    );
  });

  it('fetch_page snapshots the page and returns its id with the content', async () => {
    const job = await createJob();
    const output = JSON.parse(await tools()('fetch_page', { url: 'https://example.com/a' }));
    expect(output.snapshot_id).toMatch(/^snap_/);
    expect(output.title).toBe('Widgets');
    expect(output.content).toContain('Widgets grew 4%.');
    const snapshot = await methods.getSnapshotById(output.snapshot_id, userId);
    expect(snapshot?.sourceKind).toBe('web');
    expect((await methods.getResearchJobById(job.id))?.budgetUsed.steps).toBe(1);
  });

  it('fetch_page reports a fetch failure by code', async () => {
    await createJob();
    expect(await tools()('fetch_page', { url: 'https://blocked.example' })).toContain(
      'fetch_blocked',
    );
  });

  it('search_web returns discovery results without creating snapshots', async () => {
    await createJob();
    const output = JSON.parse(await tools()('search_web', { query: 'widgets' }));
    expect(output.results).toEqual([{ title: 'About widgets', url: 'https://example.com/r' }]);
    expect(await mongoose.models.Snapshot.countDocuments()).toBe(0);
  });

  it('refuses research once the step budget is spent but still records findings', async () => {
    const job = await createJob({ budget: { wallClockMinutes: 60, maxSteps: 1 } });
    const call = tools();
    const first = JSON.parse(await call('fetch_page', { url: 'https://example.com/a' }));
    expect(await call('search_web', { query: 'more' })).toContain('budget_exhausted');
    expect(
      await call('record_finding', { claim: 'Widgets grew', snapshot_id: first.snapshot_id }),
    ).toContain('recorded');
    const after = await methods.getResearchJobById(job.id);
    expect(after?.notes).toHaveLength(1);
    expect(after?.budgetUsed.steps).toBe(1);
    expect(after?.budgetExhaustedAt).toBeInstanceOf(Date);
  });

  it('counts findings against the step budget without passing it', async () => {
    const job = await createJob({ budget: { wallClockMinutes: 60, maxSteps: 2 } });
    const call = tools();
    const page = JSON.parse(await call('fetch_page', { url: 'https://example.com/a' }));
    await call('record_finding', { claim: 'one', snapshot_id: page.snapshot_id });
    await call('record_finding', { claim: 'two', snapshot_id: page.snapshot_id });
    const after = await methods.getResearchJobById(job.id);
    expect(after?.notes).toHaveLength(2);
    expect(after?.budgetUsed.steps).toBe(2);
  });

  it('refuses research after the watchdog flags the budget', async () => {
    await createJob({ budgetExhaustedAt: new Date() });
    expect(await tools()('search_web', { query: 'x' })).toContain('budget_exhausted');
  });

  it('record_finding only accepts snapshots the user can see', async () => {
    await createJob();
    const foreign = await createSnapshotRecorder({ methods, storage }).record({
      userId: otherUser,
      sourceKind: 'web',
      reference: 'https://example.com/z',
      markdown: 'theirs',
    });
    expect(await tools()('record_finding', { claim: 'x', snapshot_id: foreign.id })).toContain(
      'unknown_snapshot',
    );
  });

  it('record_finding stops at the verification claim cap', async () => {
    config = researchSchema.parse({ enabled: true, verification: { maxClaims: 1 } });
    await createJob();
    const call = tools();
    const page = JSON.parse(await call('fetch_page', { url: 'https://example.com/a' }));
    await call('record_finding', { claim: 'one', snapshot_id: page.snapshot_id });
    expect(await call('record_finding', { claim: 'two', snapshot_id: page.snapshot_id })).toContain(
      'notes_full',
    );
  });

  it('read_document fetches under a live request and adds the snapshot to the job inputs', async () => {
    const job = await createJob({ ...internal, status: 'briefing' });
    const output = JSON.parse(
      await tools({ isLiveRequest: true })('read_document', { reference: 'item-7' }),
    );
    expect(output.sections).toEqual(['scope']);
    const snapshot = await methods.getSnapshotById(output.snapshot_id, userId);
    expect(snapshot?.reference).toBe('s/d/item-7');
    expect(snapshot?.sourceKind).toBe('document');
    expect((await methods.getResearchJobById(job.id))?.inputSnapshotIds).toEqual([
      output.snapshot_id,
    ]);
  });

  it('read_document refuses in a detached phase without a token provider', async () => {
    await createJob(internal);
    expect(await tools()('read_document', { reference: 'item-7' })).toContain(
      'documents_need_live_session',
    );
    const allowed = await tools({ detachedDocuments: true })('read_document', {
      reference: 'item-7',
    });
    expect(JSON.parse(allowed).snapshot_id).toMatch(/^snap_/);
  });

  it('read_document enforces the submission document cap', async () => {
    config = researchSchema.parse({ enabled: true, submitFetch: { maxDocuments: 1 } });
    await createJob({ ...internal, status: 'briefing' });
    const call = tools({ isLiveRequest: true });
    await call('read_document', { reference: 'item-1' });
    expect(await call('read_document', { reference: 'item-2' })).toContain('document_limit');
  });

  it('read_document enforces the submission time window', async () => {
    await createJob({
      ...internal,
      status: 'briefing',
      startedAt: new Date(Date.now() - 11 * 60_000),
    });
    expect(await tools({ isLiveRequest: true })('read_document', { reference: 'i' })).toContain(
      'submission_window_closed',
    );
  });

  it('delegated runs cannot reach internal sources even when live', async () => {
    await createJob({
      jobType: ResearchJobType.TRENDS,
      agentId: RESEARCH_AGENT_IDS[ResearchJobType.TRENDS],
      invocationMode: 'delegated',
    });
    const call = tools({ isLiveRequest: true });
    expect(await call('read_document', { reference: 'i' })).toContain('source_not_allowed');
    expect(await call('search_uploads', { query: 'q' })).toContain('source_not_allowed');
  });

  it('delegated runs read named documents only when detached document access is installed', async () => {
    await createJob({ ...internal, invocationMode: 'delegated', status: 'researching' });
    const reference = 'https://contoso.sharepoint.com/sites/x/spec.docx';
    await methods.updateResearchJob((await methods.getResearchJobsByUser(userId))[0].id, {
      documentReferences: [reference],
    });
    expect(await tools()('read_document', { reference })).toContain('source_not_allowed');
    const allowed = await tools({ detachedDocuments: true })('read_document', { reference });
    expect(allowed).toContain('snapshot_id');
  });

  it("search_uploads snapshots each hit from the job's own uploads", async () => {
    await createJob({ ...internal, uploadFileIds: ['file-1'] });
    const output = JSON.parse(await tools()('search_uploads', { query: 'retention' }));
    expect(output.results).toHaveLength(1);
    const snapshot = await methods.getSnapshotById(output.results[0].snapshot_id, userId);
    expect(snapshot?.sourceKind).toBe('upload');
    expect(snapshot?.reference).toBe('file-1#page-3');
  });

  it('read_document refuses a reference the user did not name', async () => {
    await createJob({ ...internal, status: 'briefing' });
    expect(
      await tools({ isLiveRequest: true })('read_document', { reference: 'item-secret' }),
    ).toContain('document_not_named');
  });

  it('holds the document cap under parallel calls', async () => {
    config = researchSchema.parse({ enabled: true, submitFetch: { maxDocuments: 1 } });
    await createJob({ ...internal, status: 'briefing' });
    const call = tools({ isLiveRequest: true });
    const outputs = await Promise.all(
      ['item-1', 'item-2', 'item-7'].map((reference) => call('read_document', { reference })),
    );
    expect(outputs.filter((o) => o.includes('snapshot_id'))).toHaveLength(1);
    expect(outputs.filter((o) => o.includes('document_limit'))).toHaveLength(2);
  });

  it('holds the step budget under parallel calls', async () => {
    await createJob({ budget: { wallClockMinutes: 60, maxSteps: 2 } });
    const call = tools();
    const outputs = await Promise.all(
      Array.from({ length: 5 }, () => call('search_web', { query: 'x' })),
    );
    expect(outputs.filter((o) => o.includes('results'))).toHaveLength(2);
  });

  it('refuses web research during the brief phase', async () => {
    await createJob({ status: 'briefing' });
    expect(await tools({ isLiveRequest: true })('search_web', { query: 'x' })).toContain(
      'wrong_phase',
    );
  });

  it('only fetches prompt and search-result urls when it can read internal sources', async () => {
    await createJob(internal);
    const call = tools();
    expect(await call('fetch_page', { url: 'https://evil.example/?q=secret' })).toContain(
      'url_not_known',
    );
    await call('search_web', { query: 'widgets' });
    const page = JSON.parse(await call('fetch_page', { url: 'https://example.com/r' }));
    expect(page.snapshot_id).toMatch(/^snap_/);
    expect(await call('fetch_page', { url: 'https://example.com/next' })).toContain(
      'url_not_known',
    );
  });

  it('follows page links freely on jobs without internal sources', async () => {
    await createJob();
    const call = tools();
    await call('fetch_page', { url: 'https://example.com/a' });
    const linked = JSON.parse(await call('fetch_page', { url: 'https://example.com/next' }));
    expect(linked.snapshot_id).toMatch(/^snap_/);
  });

  it("read_feed_items lists recent items from the owner's feeds with citable snapshot ids", async () => {
    await createJob({
      jobType: ResearchJobType.DIGEST,
      agentId: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST],
    });
    const recorder = createSnapshotRecorder({ methods, storage });
    const mine = await methods.upsertFeed({ url: 'https://mine.example/rss', title: 'Mine' });
    const theirs = await methods.upsertFeed({ url: 'https://theirs.example/rss' });
    await methods.subscribeToFeed(userId, mine.id, { source: 'opml' });
    await methods.subscribeToFeed(otherUser, theirs.id, { source: 'opml' });
    for (const [feed, guid, ageHours] of [
      [mine, 'recent', 2],
      [mine, 'old', 72],
      [theirs, 'other', 1],
    ] as const) {
      const snapshot = await recorder.record({
        userId: null,
        sourceKind: 'rss',
        reference: guid,
        stableReference: true,
        feedId: feed.id,
        markdown: `Body of ${guid}`,
      });
      await methods.insertFeedItem({
        feedId: feed.id,
        guid,
        title: `Item ${guid}`,
        link: `https://x.example/${guid}`,
        publishedAt: new Date(Date.now() - ageHours * 3_600_000),
        snapshotId: snapshot.id,
      });
    }
    const output = JSON.parse(await tools()('read_feed_items', { since_hours: 24 }));
    expect(output.items.map((i: { title: string }) => i.title)).toEqual(['Item recent']);
    expect(output.items[0]).toMatchObject({ feed: 'Mine', excerpt: 'Body of recent' });
    expect(output.items[0].snapshot_id).toMatch(/^snap_/);
    const found = await tools()('record_finding', {
      claim: 'Recent thing',
      snapshot_id: output.items[0].snapshot_id,
    });
    expect(found).toContain('recorded');
  });

  it('read_feed_items defaults a scheduled digest to items since its last delivered run', async () => {
    await createJob({
      jobType: ResearchJobType.DIGEST,
      agentId: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST],
      feedsSince: new Date(Date.now() - 72 * 3_600_000),
    });
    const recorder = createSnapshotRecorder({ methods, storage });
    const mine = await methods.upsertFeed({ url: 'https://window.example/rss' });
    await methods.subscribeToFeed(userId, mine.id, { source: 'opml' });
    for (const [guid, ageHours] of [
      ['fresh', 2],
      ['two-days', 48],
      ['too-old', 96],
    ] as const) {
      const snapshot = await recorder.record({
        userId: null,
        sourceKind: 'rss',
        reference: `w-${guid}`,
        stableReference: true,
        feedId: mine.id,
        markdown: guid,
      });
      await methods.insertFeedItem({
        feedId: mine.id,
        guid,
        title: guid,
        publishedAt: new Date(Date.now() - ageHours * 3_600_000),
        snapshotId: snapshot.id,
      });
    }
    const output = JSON.parse(await tools()('read_feed_items', {}));
    expect(output.items.map((i: { title: string }) => i.title)).toEqual(['fresh', 'two-days']);
    expect(output.since.slice(0, 13)).toBe(
      new Date(Date.now() - 72 * 3_600_000).toISOString().slice(0, 13),
    );
  });

  it('read_feed_items is not available to jobs without feed sources', async () => {
    await createJob(internal);
    expect(await tools()('read_feed_items', {})).toContain('source_not_allowed');
  });

  it('submit_brief and submit_draft only work in their own phase', async () => {
    const job = await createJob({ status: 'briefing' });
    const call = tools();
    expect(await call('submit_draft', { markdown: 'too early' })).toContain('wrong_phase');
    expect(await call('submit_brief', { brief: 'The brief' })).toContain('saved');
    await methods.updateResearchJob(job.id, { status: 'drafting' });
    expect(await call('submit_draft', { markdown: 'The draft' })).toContain('saved');
    const after = await methods.getResearchJobById(job.id);
    expect(after?.brief).toBe('The brief');
    expect(after?.draft).toBe('The draft');
  });
});
