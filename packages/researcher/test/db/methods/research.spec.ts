import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import type { IResearchJobDocument, ISnapshotDocument } from '../../../src/db/types/research';
import { createResearchMethods, type ResearchMethods } from '../../../src/db/methods/research';
import { ResearchJobType } from '../../../src/contract/types';
import { createResearchModels } from '../../../src/db';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let ResearchJob: Model<IResearchJobDocument>;
let Snapshot: Model<ISnapshotDocument>;
let methods: ResearchMethods;

const alice = new mongoose.Types.ObjectId();
const bob = new mongoose.Types.ObjectId();

const baseJob = (overrides: Record<string, unknown> = {}) => ({
  id: `job_${Math.random().toString(36).slice(2)}`,
  user: alice,
  agentId: 'agent_research_current_events',
  jobType: ResearchJobType.CURRENT_EVENTS,
  invocationMode: 'interactive' as const,
  prompt: 'What is happening with X?',
  conversationId: 'convo-1',
  budget: { wallClockMinutes: 30, maxSteps: 300 },
  ...overrides,
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  ResearchJob = mongoose.models.ResearchJob as Model<IResearchJobDocument>;
  Snapshot = mongoose.models.Snapshot as Model<ISnapshotDocument>;
  await ResearchJob.init();
  await Snapshot.init();
  methods = createResearchMethods(mongoose);
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await ResearchJob.deleteMany({});
  await Snapshot.deleteMany({});
});

describe('research jobs', () => {
  it('creates a submitted job with zeroed budget usage and no deliveries', async () => {
    const job = await methods.createResearchJob(baseJob());
    expect(job.status).toBe('submitted');
    expect(job.partial).toBe(false);
    expect(job.budgetUsed).toEqual({ elapsedMs: 0, steps: 0 });
    expect(job.citedSnapshotIds).toEqual([]);
    expect(job.deliveries).toEqual([]);
  });

  it('only returns a job to its owner', async () => {
    const job = await methods.createResearchJob(baseJob());
    expect(await methods.getResearchJobById(job.id, alice)).not.toBeNull();
    expect(await methods.getResearchJobById(job.id, bob)).toBeNull();
    expect(await methods.getResearchJobsByUser(bob)).toEqual([]);
  });

  it('transitions status only from the expected phase', async () => {
    const job = await methods.createResearchJob(baseJob());
    const briefing = await methods.transitionResearchJob(job.id, 'submitted', 'briefing', {
      startedAt: new Date(),
    });
    expect(briefing?.status).toBe('briefing');
    const stale = await methods.transitionResearchJob(job.id, 'submitted', 'researching', {});
    expect(stale).toBeNull();
    const withBrief = await methods.transitionResearchJob(
      job.id,
      ['briefing', 'submitted'],
      'researching',
      { brief: 'Find out about X.' },
    );
    expect(withBrief?.status).toBe('researching');
    expect(withBrief?.brief).toBe('Find out about X.');
  });

  it('counts only live jobs toward the per-user concurrency limit', async () => {
    await methods.createResearchJob(baseJob());
    const done = await methods.createResearchJob(baseJob());
    await methods.transitionResearchJob(done.id, 'submitted', 'delivered', {});
    await methods.createResearchJob(baseJob({ user: bob }));
    expect(await methods.countActiveResearchJobs(alice)).toBe(1);
  });

  it('cancels a live job, refuses a terminal one, and ignores a stranger', async () => {
    const job = await methods.createResearchJob(baseJob());
    expect(await methods.cancelResearchJob(job.id, bob)).toBe('missing');
    expect(await methods.cancelResearchJob(job.id, alice)).toBe('cancelled');
    expect(await methods.cancelResearchJob(job.id, alice)).toBe('terminal');
    const after = await methods.getResearchJobById(job.id, alice);
    expect(after?.status).toBe('cancelled');
  });

  it('records delivery state per channel without duplicating channels', async () => {
    const job = await methods.createResearchJob(baseJob());
    await methods.setResearchDelivery(job.id, 'email', 'pending');
    await methods.setResearchDelivery(job.id, 'email', 'failed', 'smtp down');
    await methods.setResearchDelivery(job.id, 'conversation', 'sent');
    const after = await methods.getResearchJobById(job.id);
    expect(after?.deliveries).toHaveLength(2);
    const email = after?.deliveries.find((d) => d.channel === 'email');
    expect(email?.state).toBe('failed');
    expect(email?.error).toBe('smtp down');
  });

  it('marks the budget exhausted once and keeps the first time', async () => {
    const job = await methods.createResearchJob(baseJob());
    const first = new Date('2026-11-03T04:00:00.000Z');
    await methods.markResearchBudgetExhausted(job.id, first);
    await methods.markResearchBudgetExhausted(job.id, new Date('2026-11-03T05:00:00.000Z'));
    const after = await methods.getResearchJobById(job.id);
    expect(after?.budgetExhaustedAt).toEqual(first);
  });
});

describe('research job work leases and deadlines', () => {
  it('claims a job in the requested status once until the lease expires', async () => {
    const job = await methods.createResearchJob(baseJob({ status: 'verifying' }));
    const now = new Date();
    const first = await methods.claimResearchJob({
      statuses: ['verifying'],
      instanceId: 'a',
      leaseMs: 60_000,
      now,
    });
    expect(first?.id).toBe(job.id);
    expect(first?.leaseBy).toBe('a');
    const second = await methods.claimResearchJob({
      statuses: ['verifying'],
      instanceId: 'b',
      leaseMs: 60_000,
      now,
    });
    expect(second).toBeNull();
    const later = await methods.claimResearchJob({
      statuses: ['verifying'],
      instanceId: 'b',
      leaseMs: 60_000,
      now: new Date(now.getTime() + 120_000),
    });
    expect(later?.leaseBy).toBe('b');
  });

  it('releases a lease only for its holder', async () => {
    const job = await methods.createResearchJob(baseJob({ status: 'verifying' }));
    await methods.claimResearchJob({ statuses: ['verifying'], instanceId: 'a', leaseMs: 60_000 });
    await methods.releaseResearchJobLease(job.id, 'b');
    expect((await methods.getResearchJobById(job.id))?.leaseBy).toBe('a');
    await methods.releaseResearchJobLease(job.id, 'a');
    expect((await methods.getResearchJobById(job.id))?.leaseBy).toBeUndefined();
  });

  it('finds jobs past their draft threshold that have not been flagged yet', async () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);
    const due = await methods.createResearchJob(
      baseJob({ status: 'researching', draftAt: past, deadlineAt: future }),
    );
    await methods.createResearchJob(
      baseJob({ status: 'researching', draftAt: future, deadlineAt: future }),
    );
    await methods.createResearchJob(
      baseJob({
        status: 'researching',
        draftAt: past,
        deadlineAt: future,
        budgetExhaustedAt: past,
      }),
    );
    await methods.createResearchJob(
      baseJob({ status: 'drafting', draftAt: past, deadlineAt: future }),
    );
    const found = await methods.findResearchJobsPastDraftThreshold(new Date(), 10);
    expect(found.map((j) => j.id)).toEqual([due.id]);
  });

  it('finds live jobs past their hard deadline', async () => {
    const past = new Date(Date.now() - 1000);
    const stuck = await methods.createResearchJob(
      baseJob({ status: 'drafting', draftAt: past, deadlineAt: past }),
    );
    await methods.createResearchJob(
      baseJob({ status: 'delivered', draftAt: past, deadlineAt: past }),
    );
    const found = await methods.findResearchJobsPastDeadline(new Date(), 10);
    expect(found.map((j) => j.id)).toEqual([stuck.id]);
  });

  it('appends notes without exceeding the cap', async () => {
    const job = await methods.createResearchJob(baseJob());
    const note = (n: number) => ({ claim: `c${n}`, snapshotId: `s${n}` });
    await methods.appendResearchNotes(job.id, [note(1), note(2)], 3);
    const total = await methods.appendResearchNotes(job.id, [note(3), note(4)], 3);
    expect(total).toBe(3);
    const after = await methods.getResearchJobById(job.id);
    expect(after?.notes?.map((n) => n.claim)).toEqual(['c1', 'c2', 'c3']);
  });

  it('adds input snapshots once each and returns the stored count', async () => {
    const job = await methods.createResearchJob(baseJob({ uploadFileIds: ['f1'] }));
    expect(job.uploadFileIds).toEqual(['f1']);
    await methods.addResearchInputSnapshots(job.id, ['s1', 's2']);
    const count = await methods.addResearchInputSnapshots(job.id, ['s2', 's3']);
    expect(count).toBe(3);
    expect((await methods.getResearchJobById(job.id))?.inputSnapshotIds).toEqual([
      's1',
      's2',
      's3',
    ]);
  });

  it('consumes steps atomically and never past the budget', async () => {
    const job = await methods.createResearchJob(
      baseJob({ budget: { wallClockMinutes: 30, maxSteps: 3 } }),
    );
    const results = await Promise.all(
      Array.from({ length: 6 }, () => methods.consumeResearchStep(job.id)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect((await methods.getResearchJobById(job.id))?.budgetUsed.steps).toBe(3);
  });

  it('reserves document slots atomically and releases them on failure', async () => {
    const job = await methods.createResearchJob(baseJob());
    const results = await Promise.all(
      Array.from({ length: 5 }, () => methods.reserveResearchDocument(job.id, 2)),
    );
    expect(results.filter(Boolean)).toHaveLength(2);
    await methods.releaseResearchDocument(job.id);
    expect(await methods.reserveResearchDocument(job.id, 2)).toBe(true);
    expect((await methods.getResearchJobById(job.id))?.documentsRead).toBe(2);
  });

  it('keeps the newest known url hashes up to the cap', async () => {
    const job = await methods.createResearchJob(baseJob({ knownUrlHashes: ['a'] }));
    await methods.addResearchKnownUrls(job.id, ['b', 'c'], 2);
    const after = await methods.getResearchJobById(job.id);
    expect(after?.knownUrlHashes).toEqual(['b', 'c']);
  });

  it('finds the live job for a conversation and ignores finished ones', async () => {
    await methods.createResearchJob(baseJob({ conversationId: 'c-live', status: 'delivered' }));
    const live = await methods.createResearchJob(
      baseJob({ conversationId: 'c-live', status: 'researching' }),
    );
    const found = await methods.getLiveResearchJobByConversation('c-live', alice);
    expect(found?.id).toBe(live.id);
    expect(await methods.getLiveResearchJobByConversation('c-live', bob)).toBeNull();
  });
});

describe('snapshots', () => {
  const baseSnapshot = (overrides: Record<string, unknown> = {}) => ({
    id: `snap_${Math.random().toString(36).slice(2)}`,
    user: alice,
    sourceKind: 'web' as const,
    reference: 'https://example.com/a@2026-01-01T00:00:00.000Z',
    url: 'https://example.com/a',
    title: 'A',
    storageKey: 'research/alice/a.md',
    fileStrategy: 'local',
    contentHash: 'abc',
    fetchedAt: new Date(),
    ...overrides,
  });

  it('is visible to its owner and to nobody else', async () => {
    const snap = await methods.createSnapshot(baseSnapshot());
    expect(snap.archived).toBe(false);
    expect(await methods.getSnapshotById(snap.id, alice)).not.toBeNull();
    expect(await methods.getSnapshotById(snap.id, bob)).toBeNull();
  });

  it('shares feed snapshots (no owner) with every user', async () => {
    const snap = await methods.createSnapshot(
      baseSnapshot({ user: null, sourceKind: 'rss', reference: 'guid-1@2026' }),
    );
    expect(await methods.getSnapshotById(snap.id, bob)).not.toBeNull();
  });

  it('archives cited snapshots and the sweep leaves them alone', async () => {
    const old = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);
    const cited = await methods.createSnapshot(baseSnapshot({ fetchedAt: old }));
    const stale = await methods.createSnapshot(baseSnapshot({ fetchedAt: old }));
    const fresh = await methods.createSnapshot(baseSnapshot());
    await methods.archiveSnapshots([cited.id]);

    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const expired = await methods.findExpiredSnapshots(cutoff, 100);
    expect(expired.map((s) => s.id)).toEqual([stale.id]);
    expect(expired[0].storageKey).toBe('research/alice/a.md');

    const removed = await methods.deleteSnapshotsByIds([stale.id]);
    expect(removed).toBe(1);
    expect(await methods.getSnapshotById(stale.id)).toBeNull();
    expect(await methods.getSnapshotById(cited.id)).not.toBeNull();
    expect(await methods.getSnapshotById(fresh.id)).not.toBeNull();
  });

  it('fetches several snapshots for one owner in a single query', async () => {
    const a = await methods.createSnapshot(baseSnapshot());
    const b = await methods.createSnapshot(baseSnapshot({ user: bob }));
    const got = await methods.getSnapshotsByIds([a.id, b.id], alice);
    expect(got.map((s) => s.id)).toEqual([a.id]);
  });
});
