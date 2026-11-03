import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import type { IResearchJobDocument } from '../../../src/db/types/research';
import { createResearchMethods, type ResearchMethods } from '../../../src/db/methods/research';
import { ResearchJobType } from '../../../src/contract/types';
import { createResearchModels } from '../../../src/db';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let ResearchJob: Model<IResearchJobDocument>;
let methods: ResearchMethods;

const alice = new mongoose.Types.ObjectId();
const bob = new mongoose.Types.ObjectId();
const t0 = new Date('2026-11-03T00:00:00.000Z');
const later = (ms: number) => new Date(t0.getTime() + ms);

async function deliveredJob(overrides: Record<string, unknown> = {}) {
  return methods.createResearchJob({
    id: `job_${Math.random().toString(36).slice(2)}`,
    user: alice,
    agentId: 'agent_research_digest',
    jobType: ResearchJobType.DIGEST,
    invocationMode: 'delegated',
    status: 'delivered',
    prompt: 'Digest',
    conversationId: 'c1',
    budget: { wallClockMinutes: 10, maxSteps: 120 },
    deliveries: [{ channel: 'conversation', state: 'sent' }],
    ...overrides,
  } as never);
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  ResearchJob = mongoose.models.ResearchJob as Model<IResearchJobDocument>;
  await ResearchJob.init();
  await mongoose.models.ResearchSchedule.init();
  methods = createResearchMethods(mongoose);
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await ResearchJob.deleteMany({});
  await mongoose.models.ResearchSchedule.deleteMany({});
});

describe('research schedules', () => {
  it('upserts the owner’s settings and refuses another user’s schedule id', async () => {
    const created = await methods.upsertResearchSchedule({
      scheduleId: 'sched-1',
      user: alice,
      jobType: ResearchJobType.DIGEST,
      channels: ['conversation', 'email'],
    });
    expect(created).toMatchObject({ scheduleId: 'sched-1', channels: ['conversation', 'email'] });

    const updated = await methods.upsertResearchSchedule({
      scheduleId: 'sched-1',
      user: alice,
      jobType: ResearchJobType.DIGEST,
      channels: ['conversation'],
    });
    expect(updated?.channels).toEqual(['conversation']);

    const stolen = await methods.upsertResearchSchedule({
      scheduleId: 'sched-1',
      user: bob,
      jobType: ResearchJobType.DIGEST,
      channels: ['email'],
    });
    expect(stolen).toBeNull();
    expect((await methods.getResearchSchedule('sched-1', alice))?.channels).toEqual([
      'conversation',
    ]);
    expect(await methods.getResearchSchedule('sched-1', bob)).toBeNull();
  });

  it('lists and deletes only the owner’s rows', async () => {
    await methods.upsertResearchSchedule({
      scheduleId: 'a',
      user: alice,
      jobType: ResearchJobType.TRENDS,
      channels: ['conversation'],
    });
    await methods.upsertResearchSchedule({
      scheduleId: 'b',
      user: bob,
      jobType: ResearchJobType.TRENDS,
      channels: ['conversation'],
    });
    expect((await methods.listResearchSchedules(alice)).map((s) => s.scheduleId)).toEqual(['a']);
    expect(await methods.deleteResearchSchedule('b', alice)).toBe(false);
    expect(await methods.deleteResearchSchedule('a', alice)).toBe(true);
    expect(await methods.listResearchSchedules(alice)).toEqual([]);
  });

  it('finds the last delivered run of a schedule', async () => {
    await deliveredJob({ scheduleId: 's', completedAt: later(1000) });
    await deliveredJob({ scheduleId: 's', completedAt: later(5000) });
    await deliveredJob({ scheduleId: 's', status: 'failed', completedAt: later(9000) });
    await deliveredJob({ scheduleId: 's', user: bob, completedAt: later(9999) });
    const last = await methods.getLastDeliveredResearchJobForSchedule(alice, 's');
    expect(last?.completedAt?.toISOString()).toBe(later(5000).toISOString());
  });
});

describe('channel delivery ledger', () => {
  it('queues each extra channel once, as pending and due now', async () => {
    const job = await deliveredJob();
    await methods.queueResearchDeliveries(job.id, ['conversation', 'email'], t0);
    await methods.queueResearchDeliveries(job.id, ['email'], t0);
    const stored = await methods.getResearchJobById(job.id);
    expect(stored?.deliveries).toEqual([
      expect.objectContaining({ channel: 'conversation', state: 'sent' }),
      expect.objectContaining({
        channel: 'email',
        state: 'pending',
        attempts: 0,
        nextAttemptAt: t0,
      }),
    ]);
  });

  it('leases a job with a due delivery to one replica at a time', async () => {
    const job = await deliveredJob();
    await methods.queueResearchDeliveries(job.id, ['email'], later(60_000));
    expect(
      await methods.claimResearchDeliveries({ instanceId: 'a', leaseMs: 30_000, now: t0 }),
    ).toBeNull();

    const due = later(60_000);
    const claimed = await methods.claimResearchDeliveries({
      instanceId: 'a',
      leaseMs: 30_000,
      now: due,
    });
    expect(claimed?.id).toBe(job.id);
    expect(
      await methods.claimResearchDeliveries({ instanceId: 'b', leaseMs: 30_000, now: due }),
    ).toBeNull();

    await methods.releaseResearchDeliveryLease(job.id, 'a');
    expect(
      (await methods.claimResearchDeliveries({ instanceId: 'b', leaseMs: 30_000, now: due }))?.id,
    ).toBe(job.id);
  });

  it('records attempts per channel and stops claiming once nothing is pending', async () => {
    const job = await deliveredJob();
    await methods.queueResearchDeliveries(job.id, ['email', 'teams'], t0);

    await methods.recordResearchDeliveryAttempt(job.id, 'email', {
      state: 'pending',
      error: 'email_failed',
      nextAttemptAt: later(120_000),
    });
    await methods.recordResearchDeliveryAttempt(job.id, 'teams', {
      state: 'failed',
      error: 'teams_unavailable',
    });
    let stored = await methods.getResearchJobById(job.id);
    expect(stored?.deliveries.find((d) => d.channel === 'email')).toMatchObject({
      state: 'pending',
      attempts: 1,
      error: 'email_failed',
    });
    expect(stored?.deliveries.find((d) => d.channel === 'teams')).toMatchObject({
      state: 'failed',
      attempts: 1,
    });

    await methods.recordResearchDeliveryAttempt(job.id, 'email', { state: 'sent' });
    stored = await methods.getResearchJobById(job.id);
    const email = stored?.deliveries.find((d) => d.channel === 'email');
    expect(email).toMatchObject({ state: 'sent', attempts: 2 });
    expect(email?.error).toBeUndefined();
    expect(
      await methods.claimResearchDeliveries({ instanceId: 'a', leaseMs: 1, now: later(999_999) }),
    ).toBeNull();
  });
});
