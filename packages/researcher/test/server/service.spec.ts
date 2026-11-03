import mongoose from 'mongoose';
import { researchSchema } from '../../src/contract/research';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getAgentTriggerIdempotencyKey } from '@librechat/api';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { AgentTriggerEnvelope } from '@librechat/api';
import type { ResearchServiceDeps, DeliverReportInput } from '../../src/server/service';
import type { ClaimVerifier, SnapshotReader } from '../../src/server/verify';
import type { ISnapshot, ResearchHostMethods } from '../../src/db';
import { ResearchJobType, RESEARCH_AGENT_IDS } from '../../src/contract/types';
import { createResearchDbMethods, createResearchModels } from '../../src/db';
import { createResearchService } from '../../src/server/service';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;

const userId = new mongoose.Types.ObjectId().toString();
const principal = { id: userId };
const currentEventsAgent = RESEARCH_AGENT_IDS[ResearchJobType.CURRENT_EVENTS];

const contents = new Map<string, string>();
const reader: SnapshotReader = { read: async (snap: ISnapshot) => contents.get(snap.id) ?? null };
const verifier: ClaimVerifier = {
  verifyClaim: async ({ claim, passage }) => passage.includes(claim.replace(/\.$/, '')),
  checkScope: async () => null,
};

let enqueued: AgentTriggerEnvelope[];
let archivedFeedSnapshots: string[][];
let aborted: string[];
let delivered: DeliverReportInput[];
let clock: Date;
let config = researchSchema.parse({ enabled: true });

function buildService(overrides: Partial<ResearchServiceDeps> = {}) {
  return createResearchService({
    methods: {
      ...methods,
      archiveFeedItemsBySnapshot: async (ids: string[]) => {
        archivedFeedSnapshots.push(ids);
        return methods.archiveFeedItemsBySnapshot(ids);
      },
    },
    getConfig: async () => config,
    enqueueTrigger: async (envelope) => {
      enqueued.push(envelope);
    },
    abortGeneration: async (conversationId) => {
      aborted.push(conversationId);
    },
    verifier,
    reader,
    deliverReport: async (input) => {
      delivered.push(input);
      return { fileId: 'file-1' };
    },
    instanceId: 'test-instance',
    now: () => clock,
    ...overrides,
  });
}

async function admit(conversationId = 'c1', phaseKey = 'req-1') {
  const service = buildService();
  const result = await service.admitSubmission({
    principal,
    agentId: currentEventsAgent,
    conversationId,
    prompt: 'What is happening with widgets?',
    phaseKey,
  });
  if (!result || !result.ok) {
    throw new Error(`admission failed: ${JSON.stringify(result)}`);
  }
  return { service, job: result.job };
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
  contents.clear();
  enqueued = [];
  archivedFeedSnapshots = [];
  aborted = [];
  delivered = [];
  clock = new Date('2026-11-03T00:00:00.000Z');
  config = researchSchema.parse({ enabled: true });
});

describe('admitSubmission', () => {
  it('ignores agents that are not research agents', async () => {
    const result = await buildService().admitSubmission({
      principal,
      agentId: 'agent_other',
      conversationId: 'c1',
      prompt: 'hi',
      phaseKey: 'k',
    });
    expect(result).toBeNull();
  });

  it('refuses when research is disabled', async () => {
    config = researchSchema.parse({ enabled: false });
    const result = await buildService().admitSubmission({
      principal,
      agentId: currentEventsAgent,
      conversationId: 'c1',
      prompt: 'hi',
      phaseKey: 'k',
    });
    expect(result).toEqual({ ok: false, error: { code: 'research_disabled' } });
  });

  it('creates a briefing job with budget deadlines and the phase key', async () => {
    const { job } = await admit();
    expect(job.status).toBe('briefing');
    expect(job.jobType).toBe(ResearchJobType.CURRENT_EVENTS);
    expect(job.phaseDeliveryKey).toBe('req-1');
    expect(job.budget).toEqual({ wallClockMinutes: 30, maxSteps: 300 });
    expect(new Date(job.draftAt!).toISOString()).toBe('2026-11-03T00:25:30.000Z');
    expect(new Date(job.deadlineAt!).toISOString()).toBe('2026-11-03T00:30:00.000Z');
  });

  it('records the documents and urls the user named', async () => {
    const result = await buildService().admitSubmission({
      principal,
      agentId: RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION],
      conversationId: 'c9',
      prompt: 'Use https://contoso.sharepoint.com/sites/x/spec.docx and onedrive:/notes.docx',
      phaseKey: 'k',
      uploadFileIds: ['file-1'],
    });
    if (!result?.ok) {
      throw new Error('admission failed');
    }
    expect(result.job.documentReferences).toEqual([
      'https://contoso.sharepoint.com/sites/x/spec.docx',
      'onedrive:/notes.docx',
    ]);
    expect(result.job.knownUrlHashes).toHaveLength(1);
    expect(result.job.uploadFileIds).toEqual(['file-1']);
  });

  it('refuses a second job in the same conversation', async () => {
    const { service } = await admit('c1');
    const result = await service.admitSubmission({
      principal,
      agentId: currentEventsAgent,
      conversationId: 'c1',
      prompt: 'again',
      phaseKey: 'req-2',
    });
    expect(result).toEqual({ ok: false, error: { code: 'research_job_running' } });
  });

  it('enforces the per-user concurrency limit', async () => {
    config = researchSchema.parse({ enabled: true, maxConcurrentJobsPerUser: 1 });
    const { service } = await admit('c1');
    const result = await service.admitSubmission({
      principal,
      agentId: currentEventsAgent,
      conversationId: 'c2',
      prompt: 'second',
      phaseKey: 'req-2',
    });
    expect(result).toEqual({ ok: false, error: { code: 'research_concurrency_limit' } });
  });

  it('refuses a delegated run of a job that needs a live user token', async () => {
    const result = await buildService().admitSubmission({
      principal,
      agentId: RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION],
      conversationId: 'c1',
      prompt: 'x',
      phaseKey: 'k',
      invocationMode: 'delegated',
    });
    expect(result).toEqual({ ok: false, error: { code: 'research_job_not_schedulable' } });
  });
});

describe('delegated document access (design 5.9)', () => {
  it('schedules jobs 1 and 5 once a gateway token provider is installed', async () => {
    const result = await buildService({ delegatedDocuments: true }).admitSubmission({
      principal,
      agentId: RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION],
      conversationId: 'c-solution',
      prompt: 'x',
      phaseKey: 'k',
      invocationMode: 'delegated',
    });
    expect(result?.ok).toBe(true);
  });
});

describe('settlePhase', () => {
  it('ignores a settlement whose request key does not match the phase', async () => {
    const { service, job } = await admit();
    await service.settlePhase({
      principal,
      conversationId: 'c1',
      clientRequestId: 'someone-else',
      status: 'success',
      responseMessageId: 'm1',
    });
    expect((await methods.getResearchJobById(job.id))?.status).toBe('briefing');
    expect(enqueued).toHaveLength(0);
  });

  it('advances the brief to research and enqueues a continue keyed to the job', async () => {
    const { service, job } = await admit();
    await service.settlePhase({
      principal,
      conversationId: 'c1',
      clientRequestId: 'req-1',
      status: 'success',
      responseMessageId: 'm1',
      responseText: 'The brief.',
    });
    const after = await methods.getResearchJobById(job.id);
    expect(after?.status).toBe('researching');
    expect(after?.brief).toBe('The brief.');
    expect(enqueued).toHaveLength(1);
    const envelope = enqueued[0];
    expect(envelope.mode).toBe('continue');
    expect(envelope.principal.userId).toBe(userId);
    expect(envelope.target).toMatchObject({
      agentId: currentEventsAgent,
      conversationId: 'c1',
      parentMessageId: 'm1',
    });
    expect(envelope.event.source).toEqual({ id: job.id, type: 'research' });
    expect(envelope.input).toContain('[Research phase]');
    expect(after?.phaseDeliveryKey).toBe(getAgentTriggerIdempotencyKey(envelope));
  });

  it('applies a settlement once even when it is delivered twice', async () => {
    const { service } = await admit();
    const settle = {
      principal,
      conversationId: 'c1',
      clientRequestId: 'req-1',
      status: 'success' as const,
      responseMessageId: 'm1',
    };
    await Promise.all([service.settlePhase(settle), service.settlePhase(settle)]);
    expect(enqueued).toHaveLength(1);
  });

  it('moves a drafted job to verification without a further generation', async () => {
    const { service, job } = await admit();
    await methods.updateResearchJob(job.id, {
      status: 'drafting',
      phaseDeliveryKey: 'draft-key',
      draft: 'Saved draft. [[cite:s1]]',
    });
    await service.settlePhase({
      principal,
      conversationId: 'c1',
      clientRequestId: 'draft-key',
      status: 'success',
      responseMessageId: 'm3',
    });
    const after = await methods.getResearchJobById(job.id);
    expect(after?.status).toBe('verifying');
    expect(after?.parentMessageId).toBe('m3');
    expect(enqueued).toHaveLength(0);
  });

  it('fails a job whose brief generation errored', async () => {
    const { service, job } = await admit();
    await service.settlePhase({
      principal,
      conversationId: 'c1',
      clientRequestId: 'req-1',
      status: 'error',
    });
    const after = await methods.getResearchJobById(job.id);
    expect(after?.status).toBe('failed');
    expect(after?.failureReason).toBe('brief_failed');
  });
});

describe('cancel', () => {
  it('cancels a live job and stops its generation', async () => {
    const { service, job } = await admit();
    expect(await service.cancel(job.id, userId)).toBe('cancelled');
    expect(aborted).toEqual(['c1']);
    expect(await service.cancel(job.id, userId)).toBe('terminal');
  });
});

describe('tick', () => {
  it('stops research at the draft threshold by aborting the running generation', async () => {
    const { service, job } = await admit();
    await methods.updateResearchJob(job.id, { status: 'researching' });
    clock = new Date('2026-11-03T00:26:00.000Z');
    await service.tick();
    const after = await methods.getResearchJobById(job.id);
    expect(after?.budgetExhaustedAt).toBeDefined();
    expect(aborted).toEqual(['c1']);
    await service.tick();
    expect(aborted).toEqual(['c1']);
  });

  it('forces a stuck job past its deadline to verification with a fallback draft', async () => {
    const { service, job } = await admit();
    await methods.updateResearchJob(job.id, {
      status: 'researching',
      notes: [{ claim: 'Widgets grew', snapshotId: 's1' }],
    });
    clock = new Date('2026-11-03T00:31:00.000Z');
    delivered = [];
    await service.tick();
    const after = await methods.getResearchJobById(job.id);
    expect(['verifying', 'delivered']).toContain(after?.status);
    expect(after?.partial).toBe(true);
    expect(after?.draft).toContain('[[cite:s1]]');
  });

  it('verifies, delivers and archives the cited snapshots of a drafted job', async () => {
    const { service, job } = await admit();
    const snap = await methods.createSnapshot({
      id: 's1',
      user: new mongoose.Types.ObjectId(userId),
      sourceKind: 'web',
      reference: 'https://example.com/a@2026-11-02',
      url: 'https://example.com/a',
      title: 'Widget news',
      storageKey: 'k/s1',
      fileStrategy: 'local',
      contentHash: 'h',
      fetchedAt: new Date('2026-11-02T00:00:00.000Z'),
    });
    contents.set(snap.id, 'Widgets grew 4% this quarter.');
    await methods.updateResearchJob(job.id, {
      status: 'verifying',
      brief: 'Widgets',
      draft: 'Widgets grew 4% this quarter. [[cite:s1]] Widgets are purple. [[cite:s1]]',
      parentMessageId: 'm3',
    });
    await service.tick();

    expect(delivered).toHaveLength(1);
    expect(delivered[0].parentMessageId).toBe('m3');
    expect(delivered[0].markdown).toContain('1 supported, 1 unverified');
    expect(delivered[0].markdown).toContain('**[Unverified]** Widgets are purple.');
    const after = await methods.getResearchJobById(job.id);
    expect(after?.status).toBe('delivered');
    expect(after?.reportFileId).toBe('file-1');
    expect(after?.citedSnapshotIds).toEqual(['s1']);
    expect(after?.verification).toMatchObject({ supported: 1, unsupported: 1, total: 2 });
    expect(after?.deliveries).toEqual([
      expect.objectContaining({ channel: 'conversation', state: 'sent' }),
    ]);
    expect(after?.leaseBy).toBeUndefined();
    expect((await methods.getSnapshotById('s1'))?.archived).toBe(true);
    expect(archivedFeedSnapshots).toEqual([['s1']]);
  });

  it('titles the report with the brief’s question, not its heading', async () => {
    const { service, job } = await admit();
    await methods.updateResearchJob(job.id, {
      status: 'verifying',
      brief: '## Question\nWhat is happening with widgets this week?\n\n## Sources\n- Web',
      draft: 'No findings.',
      parentMessageId: 'm3',
    });
    await service.tick();
    expect(delivered[0].title).toBe(
      'Current events research: What is happening with widgets this week?',
    );
  });

  it('resolves the verifier for the job owner when given a factory', async () => {
    const { job } = await admit();
    await methods.updateResearchJob(job.id, { status: 'verifying', draft: 'Nothing cited.' });
    const seen: string[] = [];
    const service = buildService({
      verifier: async (owner) => {
        seen.push(owner.id);
        return verifier;
      },
    });
    await service.tick();
    expect(seen).toEqual([userId]);
    expect((await methods.getResearchJobById(job.id))?.status).toBe('delivered');
  });

  it('keeps a failed job in verification and holds its lease as the retry backoff', async () => {
    const { job } = await admit();
    await methods.updateResearchJob(job.id, { status: 'verifying', draft: 'Nothing cited.' });
    let calls = 0;
    const service = buildService({
      deliverReport: async () => {
        calls += 1;
        throw new Error('storage down');
      },
    });
    await service.tick();
    const after = await methods.getResearchJobById(job.id);
    expect(after).toMatchObject({ status: 'verifying', verificationAttempts: 1 });
    expect(after?.leaseBy).toBe('test-instance');
    expect(calls).toBe(1);
  });
});

describe('verification failures', () => {
  it('fails a job with a stable code once verification has failed maxAttempts times', async () => {
    config = researchSchema.parse({ enabled: true, verification: { maxAttempts: 2 } });
    const { job } = await admit();
    await methods.updateResearchJob(job.id, { status: 'verifying', draft: 'Nothing cited.' });
    const service = buildService({
      deliverReport: async () => {
        throw new Error('storage down');
      },
    });
    await service.tick();
    let after = await methods.getResearchJobById(job.id);
    expect(after).toMatchObject({ status: 'verifying', verificationAttempts: 1 });
    clock = new Date(clock.getTime() + 11 * 60_000);
    await service.tick();
    after = await methods.getResearchJobById(job.id);
    expect(after).toMatchObject({ status: 'failed', failureReason: 'verification_failed' });
    expect(after?.completedAt).toBeDefined();
    expect(after?.leaseBy).toBeUndefined();
  });
});

describe('scheduled runs', () => {
  const trendsAgent = RESEARCH_AGENT_IDS[ResearchJobType.TRENDS];
  const digestAgent = RESEARCH_AGENT_IDS[ResearchJobType.DIGEST];

  async function pastRun(overrides: Record<string, unknown>) {
    return methods.createResearchJob({
      id: `past_${Math.random().toString(36).slice(2)}`,
      user: new mongoose.Types.ObjectId(userId),
      agentId: trendsAgent,
      jobType: ResearchJobType.TRENDS,
      invocationMode: 'delegated',
      status: 'delivered',
      prompt: 'Widgets',
      conversationId: `old-${Math.random()}`,
      budget: { wallClockMinutes: 30, maxSteps: 300 },
      scheduleId: 'sched-1',
      reportFileId: 'f',
      ...overrides,
    } as never);
  }

  async function scheduled(agentId: string, conversationId = 'run-1') {
    const result = await buildService().admitSubmission({
      principal,
      agentId,
      conversationId,
      prompt: 'Widgets',
      phaseKey: `trigger:${conversationId}`,
      invocationMode: 'delegated',
      scheduleId: 'sched-1',
    });
    if (!result || !result.ok) {
      throw new Error(`admission failed: ${JSON.stringify(result)}`);
    }
    return result.job;
  }

  it('loads the newest prior reports of the same trends schedule as input snapshots', async () => {
    config = researchSchema.parse({ enabled: true, jobs: { trends: { priorReports: 2 } } });
    await pastRun({ reportSnapshotId: 'r-old', completedAt: new Date('2026-10-01') });
    await pastRun({ reportSnapshotId: 'r-mid', completedAt: new Date('2026-10-15') });
    await pastRun({ reportSnapshotId: 'r-new', completedAt: new Date('2026-11-01') });
    await pastRun({ reportSnapshotId: 'r-other', scheduleId: 'sched-2' });
    const job = await scheduled(trendsAgent);
    expect(job.invocationMode).toBe('delegated');
    expect(job.scheduleId).toBe('sched-1');
    expect(job.inputSnapshotIds).toEqual(['r-new', 'r-mid']);
  });

  it('starts a scheduled digest at the schedule’s last delivered run', async () => {
    const first = await scheduled(digestAgent, 'run-0');
    expect(first.feedsSince).toBeUndefined();
    await methods.updateResearchJob(first.id, {
      status: 'delivered',
      completedAt: new Date('2026-11-02T06:00:00.000Z'),
    });
    const next = await scheduled(digestAgent, 'run-1');
    expect(new Date(next.feedsSince!).toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });

  it('keeps a delivered scheduled trends report as an archived prior-report snapshot', async () => {
    const job = await scheduled(trendsAgent);
    await methods.updateResearchJob(job.id, { status: 'verifying', draft: 'Nothing cited.' });
    const recorded: string[] = [];
    const service = buildService({
      recordReportSnapshot: async ({ job: reportJob, markdown }) => {
        recorded.push(markdown);
        const snap = await methods.createSnapshot({
          id: `report_${reportJob.id}`,
          user: new mongoose.Types.ObjectId(userId),
          sourceKind: 'priorReport',
          reference: `report:${reportJob.id}`,
          storageKey: 'k',
          fileStrategy: 'local',
          contentHash: 'h',
          fetchedAt: clock,
        });
        return { snapshotId: snap.id };
      },
    });
    await service.tick();
    const after = await methods.getResearchJobById(job.id);
    expect(after?.status).toBe('delivered');
    expect(after?.reportSnapshotId).toBe(`report_${job.id}`);
    expect(recorded[0]).toContain('# ');
    expect((await methods.getSnapshotById(`report_${job.id}`))?.archived).toBe(true);
  });

  it('does not keep a report snapshot for interactive runs', async () => {
    const { service, job } = await admit();
    await methods.updateResearchJob(job.id, { status: 'verifying', draft: 'Nothing cited.' });
    const recordReportSnapshot = jest.fn();
    await buildService({ recordReportSnapshot }).tick();
    expect(recordReportSnapshot).not.toHaveBeenCalled();
    expect(service).toBeDefined();
  });

  it.each([
    [trendsAgent, '## What changed since the last report'],
    [digestAgent, '## Left out'],
  ])('adds the required section when the %s draft leaves it out', async (agentId, heading) => {
    const job = await scheduled(agentId);
    await methods.updateResearchJob(job.id, { status: 'verifying', draft: 'Nothing cited.' });
    await buildService().tick();
    expect(delivered[0].markdown).toContain(heading);
    expect(delivered[0].markdown).toContain('The draft did not include this section.');
  });

  it('leaves a required section alone when the draft has it', async () => {
    const job = await scheduled(digestAgent);
    await methods.updateResearchJob(job.id, {
      status: 'verifying',
      draft: 'Kept two items.\n\n## Left out\n\n- An item about lunch, off topic.',
    });
    await buildService().tick();
    expect(delivered[0].markdown.match(/## Left out/g)).toHaveLength(1);
    expect(delivered[0].markdown).not.toContain('The draft did not include this section.');
  });
});

describe('extra delivery channels', () => {
  const digestAgent = RESEARCH_AGENT_IDS[ResearchJobType.DIGEST];
  let sends: Array<{ jobId: string; markdown: string }>;
  let emailResult: () => Promise<{ ok: true } | { ok: false; code: string; retryable: boolean }>;

  const email = {
    channel: 'email' as const,
    send: async (input: { job: { id: string }; markdown: string }) => {
      sends.push({ jobId: input.job.id, markdown: input.markdown });
      return emailResult();
    },
  };

  function channelService(overrides: Partial<ResearchServiceDeps> = {}) {
    return buildService({
      channels: [email],
      recordReportSnapshot: async ({ job, markdown }) => {
        const snap = await methods.createSnapshot({
          id: `report_${job.id}`,
          user: new mongoose.Types.ObjectId(userId),
          sourceKind: 'priorReport',
          reference: `report:${job.id}`,
          storageKey: `k/report_${job.id}`,
          fileStrategy: 'local',
          contentHash: 'h',
          fetchedAt: clock,
        });
        contents.set(snap.id, markdown);
        return { snapshotId: snap.id };
      },
      ...overrides,
    });
  }

  async function scheduledDigest(channels: Array<'conversation' | 'email' | 'teams'>) {
    await methods.upsertResearchSchedule({
      scheduleId: 'sched-mail',
      user: userId,
      jobType: ResearchJobType.DIGEST,
      channels,
    });
    const result = await channelService().admitSubmission({
      principal,
      agentId: digestAgent,
      conversationId: `mail-${Math.random()}`,
      prompt: 'Digest',
      phaseKey: `k-${Math.random()}`,
      invocationMode: 'delegated',
      scheduleId: 'sched-mail',
    });
    if (!result?.ok) {
      throw new Error('admission failed');
    }
    await methods.updateResearchJob(result.job.id, {
      status: 'verifying',
      draft: 'Nothing cited.',
    });
    return result.job;
  }

  beforeEach(async () => {
    sends = [];
    emailResult = async () => ({ ok: true });
    await mongoose.models.ResearchSchedule.deleteMany({});
  });

  it('queues and sends the email a schedule asks for, after the conversation delivery', async () => {
    const job = await scheduledDigest(['conversation', 'email']);
    const service = channelService();
    await service.tick();
    let after = await methods.getResearchJobById(job.id);
    expect(after?.status).toBe('delivered');
    expect(after?.deliveries.find((d) => d.channel === 'conversation')?.state).toBe('sent');
    expect(sends).toHaveLength(1);
    expect(sends[0].markdown).toContain('# ');
    after = await methods.getResearchJobById(job.id);
    expect(after?.deliveries.find((d) => d.channel === 'email')).toMatchObject({
      state: 'sent',
      attempts: 1,
    });
    expect(after?.deliveryLeaseBy).toBeUndefined();
  });

  it('skips channels the deployment turned off', async () => {
    config = researchSchema.parse({ enabled: true, delivery: { email: false } });
    const job = await scheduledDigest(['conversation', 'email']);
    await channelService().tick();
    const after = await methods.getResearchJobById(job.id);
    expect(after?.deliveries.map((d) => d.channel)).toEqual(['conversation']);
    expect(sends).toEqual([]);
  });

  it('retries a failed email with backoff and gives up after the attempt limit', async () => {
    config = researchSchema.parse({
      enabled: true,
      delivery: { maxAttempts: 2, retryBaseSeconds: 60 },
    });
    emailResult = async () => ({ ok: false, code: 'email_failed', retryable: true });
    const job = await scheduledDigest(['email']);
    const service = channelService();
    await service.tick();
    let record = (await methods.getResearchJobById(job.id))?.deliveries.find(
      (d) => d.channel === 'email',
    );
    expect(record).toMatchObject({ state: 'pending', attempts: 1, error: 'email_failed' });
    expect(new Date(record!.nextAttemptAt!).toISOString()).toBe('2026-11-03T00:01:00.000Z');

    await service.tick();
    expect(sends).toHaveLength(1);

    clock = new Date('2026-11-03T00:01:00.000Z');
    await service.tick();
    const after = await methods.getResearchJobById(job.id);
    record = after?.deliveries.find((d) => d.channel === 'email');
    expect(record).toMatchObject({ state: 'failed', attempts: 2, error: 'email_failed' });
    expect(after?.status).toBe('delivered');
  });

  it('fails a channel at once when the error cannot be retried', async () => {
    emailResult = async () => ({ ok: false, code: 'email_no_address', retryable: false });
    const job = await scheduledDigest(['email']);
    await channelService().tick();
    const record = (await methods.getResearchJobById(job.id))?.deliveries.find(
      (d) => d.channel === 'email',
    );
    expect(record).toMatchObject({ state: 'failed', attempts: 1, error: 'email_no_address' });
  });

  it('records a thrown send as a retryable failure', async () => {
    emailResult = async () => {
      throw new Error('smtp exploded with secrets');
    };
    const job = await scheduledDigest(['email']);
    await channelService().tick();
    const record = (await methods.getResearchJobById(job.id))?.deliveries.find(
      (d) => d.channel === 'email',
    );
    expect(record).toMatchObject({ state: 'pending', error: 'email_failed' });
    expect(JSON.stringify(record)).not.toContain('secrets');
  });

  it('fails a channel with no implementation instead of retrying it', async () => {
    config = researchSchema.parse({ enabled: true, delivery: { teams: true } });
    const job = await scheduledDigest(['teams']);
    await channelService().tick();
    const record = (await methods.getResearchJobById(job.id))?.deliveries.find(
      (d) => d.channel === 'teams',
    );
    expect(record).toMatchObject({ state: 'failed', error: 'channel_unavailable' });
  });
});
