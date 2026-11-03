import http from 'node:http';
import mongoose from 'mongoose';
import { researchSchema } from '../../src/contract/research';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { AgentTriggerEnvelope } from '@librechat/api';
import type { ResearchAppConfig } from '../../src/server/config';
import type { AddressInfo } from 'node:net';
import type { ResearchHostDeps, ResearchRequest } from '../../src/server/host';
import type { ResearchHostMethods } from '../../src/db';
import { createResearchHost, ResearchAdmissionError } from '../../src/server/host';
import { ResearchJobType, RESEARCH_AGENT_IDS } from '../../src/contract/types';
import { createResearchDbMethods, createResearchModels } from '../../src/db';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;
let enqueued: AgentTriggerEnvelope[];
const userId = new mongoose.Types.ObjectId().toString();
const otherUser = new mongoose.Types.ObjectId().toString();
const conversationId = '3f1c2b9a-1111-4222-8333-444455556666';

const appConfig = {
  researcher: researchSchema.parse({
    enabled: true,
    agents: { provider: 'gateway', model: 'm' },
    documents: { mcpServer: 'gw', toolName: 'get_document' },
  }),
} as ResearchAppConfig;

function host(overrides: Partial<ResearchHostDeps> = {}) {
  return createResearchHost({
    methods,
    getAppConfig: async () => appConfig,
    enqueueTrigger: async (envelope) => {
      enqueued.push(envelope);
    },
    getStorage: () => ({
      save: async ({ key }) => ({ storageKey: key, fileStrategy: 'memory' }),
      read: async () => null,
      remove: async () => undefined,
    }),
    getReportStorage: () => ({
      saveBuffer: async ({ fileName }) => ({ filepath: `/uploads/${fileName}`, source: 'memory' }),
    }),
    createMcpCaller: () => async () => ({ content: [{ type: 'text', text: 'Doc body' }] }),
    endpointDb: { getUserKey: async () => '', getUserKeyValues: async () => ({}) } as never,
    instanceId: 'test',
    ...overrides,
  });
}

function request(overrides: Partial<ResearchRequest> = {}): ResearchRequest {
  return {
    user: { id: userId },
    config: appConfig,
    body: {
      agent_id: RESEARCH_AGENT_IDS[ResearchJobType.REQUIREMENTS],
      text: 'Check https://contoso.sharepoint.com/sites/x/spec.docx',
      conversationId,
      clientRequestId: 'client-req-1',
      files: [],
    },
    ...overrides,
  } as ResearchRequest;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  methods = { ...createMethods(mongoose), ...createResearchDbMethods(mongoose) };
  await mongoose.models.ResearchJob.init();
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await mongoose.models.ResearchJob.deleteMany({});
  await mongoose.models.File.deleteMany({});
  await mongoose.models.FeedItem.deleteMany({});
  await mongoose.models.User.deleteMany({});
  await mongoose.models.Snapshot.deleteMany({});
  enqueued = [];
});

describe('createResearchHost', () => {
  it('ignores ordinary agents without touching the database', async () => {
    const spy = jest.spyOn(methods, 'getLiveResearchJobByConversation');
    const research = host();
    const req = request({ body: { ...request().body, agent_id: 'agent_other' } });
    expect(await research.admitRequest(req, conversationId)).toBeNull();
    await research.settleRequest(req, { conversationId, status: 'success' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not admit trigger-dispatched phase requests as new jobs', async () => {
    const result = await host().admitRequest(request({ _isAgentTrigger: true }), conversationId);
    expect(result).toBeNull();
    expect(await mongoose.models.ResearchJob.countDocuments()).toBe(0);
  });

  it('admits a research turn with only the uploads the user owns', async () => {
    await methods.createFile(
      {
        user: userId as never,
        file_id: 'mine',
        filename: 'a.pdf',
        filepath: '/a',
        type: 'application/pdf',
        bytes: 1,
      },
      true,
    );
    await methods.createFile(
      {
        user: otherUser as never,
        file_id: 'theirs',
        filename: 'b.pdf',
        filepath: '/b',
        type: 'application/pdf',
        bytes: 1,
      },
      true,
    );
    const req = request();
    req.body.files = [{ file_id: 'mine' }, { file_id: 'theirs' }];
    const result = await host().admitRequest(req, conversationId);
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.job.uploadFileIds).toEqual(['mine']);
      expect(result.job.phaseDeliveryKey).toBe('client-req-1');
      expect(result.job.documentReferences).toEqual([
        'https://contoso.sharepoint.com/sites/x/spec.docx',
      ]);
    }
  });

  describe('schedule fires', () => {
    const fire = (agentId: string, overrides: Record<string, unknown> = {}) =>
      request({
        _isAgentTrigger: true,
        body: {
          agent_id: agentId,
          text: 'Widgets this week',
          conversationId,
          clientRequestId: 'trigger-key-1',
          files: [],
          agentTrigger: {
            version: 1,
            event: {
              type: 'schedule.occurrence',
              occurredAt: Date.parse('2026-11-03T00:00:00.000Z'),
              source: { type: 'schedule', id: 'sched-1' },
            },
          },
          ...overrides,
        },
      } as Partial<ResearchRequest>);

    it('admits a schedule fire as a delegated job carrying its schedule id', async () => {
      const result = await host().admitRequest(
        fire(RESEARCH_AGENT_IDS[ResearchJobType.TRENDS]),
        conversationId,
      );
      expect(result?.ok).toBe(true);
      if (result?.ok) {
        expect(result.job).toMatchObject({
          invocationMode: 'delegated',
          scheduleId: 'sched-1',
          phaseDeliveryKey: 'trigger-key-1',
          jobType: ResearchJobType.TRENDS,
        });
      }
    });

    it('settles the scheduled brief under the trigger key', async () => {
      const research = host();
      const req = fire(RESEARCH_AGENT_IDS[ResearchJobType.TRENDS]);
      await research.admitRequest(req, conversationId);
      await research.settleRequest(req, {
        conversationId,
        status: 'success',
        responseMessageId: '9f1c2b9a-1111-4222-8333-444455556666',
        responseText: 'Brief',
      });
      const job = await methods.getLiveResearchJobByConversation(conversationId, userId);
      expect(job?.status).toBe('researching');
    });

    it('keeps researching when the phase trigger is fenced before its generation starts', async () => {
      const research = host();
      const req = fire(RESEARCH_AGENT_IDS[ResearchJobType.DIGEST]);
      await research.admitRequest(req, conversationId);
      await research.settleRequest(req, {
        conversationId,
        status: 'success',
        responseMessageId: '9f1c2b9a-1111-4222-8333-444455556666',
        responseText: 'Brief',
      });
      const researching = await methods.getLiveResearchJobByConversation(conversationId, userId);
      const phase = request({
        _isAgentTrigger: true,
        body: {
          agent_id: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST],
          text: '[Research phase]',
          conversationId,
          clientRequestId: researching?.phaseDeliveryKey,
          files: [],
        },
      } as Partial<ResearchRequest>);
      await research.settleRequest(phase, { conversationId, status: 'error', started: false });
      const job = await methods.getLiveResearchJobByConversation(conversationId, userId);
      expect(job?.status).toBe('researching');
      expect(job?.partial).toBe(false);
    });

    it('refuses a schedule fire for a job that needs a live user', async () => {
      const error = await host()
        .admitOrThrow(fire(RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION]), conversationId)
        .catch((e: unknown) => e);
      expect(error).toMatchObject({ status: 400, code: 'research_job_not_schedulable' });
    });

    it('ignores a schedule-shaped body on a request that is not a trusted trigger', async () => {
      const forged = fire(RESEARCH_AGENT_IDS[ResearchJobType.TRENDS]);
      forged._isAgentTrigger = false;
      const result = await host().admitRequest(forged, conversationId);
      expect(result?.ok).toBe(true);
      if (result?.ok) {
        expect(result.job.invocationMode).toBe('interactive');
        expect(result.job.scheduleId).toBeUndefined();
      }
    });
  });

  it('settles the interactive brief under the user request key', async () => {
    const research = host();
    await research.admitRequest(request(), conversationId);
    await research.settleRequest(request(), {
      conversationId,
      status: 'success',
      responseMessageId: '9f1c2b9a-1111-4222-8333-444455556666',
      responseText: 'Brief',
    });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].mode).toBe('continue');
  });

  it('builds tools that refuse documents on trigger requests', async () => {
    const research = host();
    await research.admitRequest(request(), conversationId);
    const live = await research.createTools(request());
    const detached = await research.createTools(request({ _isAgentTrigger: true }));
    const call = async (tools: typeof live, args: Record<string, unknown>) =>
      String(await tools.find((t) => t.name === 'read_document')!.invoke(args));
    const reference = 'https://contoso.sharepoint.com/sites/x/spec.docx';
    expect(await call(detached, { reference })).toContain('documents_need_live_session');
    expect(await call(live, { reference })).toContain('snapshot_id');
  });

  it('throws a coded admission error the controller can answer and release', async () => {
    const research = host();
    await research.admitOrThrow(request(), conversationId);
    const error = await research
      .admitOrThrow(
        request({ body: { ...request().body, clientRequestId: 'client-req-2' } }),
        conversationId,
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResearchAdmissionError);
    expect(error).toMatchObject({ status: 409, code: 'research_job_running' });
  });

  it('maps controller settlement statuses onto phase outcomes', async () => {
    const research = host();
    await research.admitRequest(request(), conversationId);
    await research.settleRequest(request(), { conversationId, status: 'cancelled' });
    const job = await methods.getLiveResearchJobByConversation(conversationId, userId);
    expect(job).toBeNull();
    const failed = await mongoose.models.ResearchJob.findOne({ conversationId }).lean();
    expect(failed).toMatchObject({ status: 'failed', failureReason: 'brief_failed' });
  });

  it('fails an interactive brief that never started, since nothing will retry it', async () => {
    const research = host();
    await research.admitRequest(request(), conversationId);
    await research.settleRequest(request(), { conversationId, status: 'error', started: false });
    const failed = await mongoose.models.ResearchJob.findOne({ conversationId }).lean();
    expect(failed).toMatchObject({ status: 'failed', failureReason: 'brief_failed' });
  });

  it('expires old unarchived feed items in the nightly sweep', async () => {
    const feed = await methods.upsertFeed({ url: 'https://feed.example/rss' });
    const old = new Date(Date.now() - 50 * 24 * 3_600_000);
    await methods.insertFeedItem({
      feedId: feed.id,
      guid: 'old',
      publishedAt: old,
      snapshotId: 's-old',
    });
    await methods.insertFeedItem({
      feedId: feed.id,
      guid: 'kept',
      publishedAt: old,
      snapshotId: 's-kept',
    });
    await methods.archiveFeedItemsBySnapshot(['s-kept']);
    const hour = new Date().getUTCHours();
    const research = host({
      getAppConfig: async () =>
        ({
          researcher: researchSchema.parse({ enabled: true, snapshots: { sweepHour: hour } }),
        }) as ResearchAppConfig,
    });
    await research.backgroundPass();
    expect(await methods.findKnownFeedGuids(feed.id, ['old', 'kept'])).toEqual(['kept']);
  });

  it('sends a due email delivery through the supplied sendEmail', async () => {
    const sent: Array<{ email: string; subject: string }> = [];
    await mongoose.models.User.create({
      _id: new mongoose.Types.ObjectId(userId),
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada',
      provider: 'local',
    });
    const snapshot = await methods.createSnapshot({
      id: 'report_snap',
      user: new mongoose.Types.ObjectId(userId),
      sourceKind: 'priorReport',
      reference: 'report:job',
      storageKey: 'k',
      fileStrategy: 'memory',
      contentHash: 'h',
      fetchedAt: new Date(),
      archived: true,
    });
    const job = await methods.createResearchJob({
      id: 'research_mail',
      user: new mongoose.Types.ObjectId(userId),
      agentId: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST],
      jobType: ResearchJobType.DIGEST,
      invocationMode: 'delegated',
      status: 'delivered',
      prompt: 'Digest',
      conversationId,
      budget: { wallClockMinutes: 10, maxSteps: 120 },
      reportSnapshotId: snapshot.id,
      completedAt: new Date('2026-11-03T01:00:00.000Z'),
    } as never);
    await methods.queueResearchDeliveries(job.id, ['email'], new Date(0));
    const research = host({
      getStorage: () => ({
        save: async ({ key }) => ({ storageKey: key, fileStrategy: 'memory' }),
        read: async () => '# Daily digest\n\nBody',
        remove: async () => undefined,
      }),
      email: {
        sendEmail: async (params) => {
          sent.push({ email: params.email, subject: params.subject });
        },
        appUrl: 'https://chat.example.com',
      },
    });
    await research.backgroundPass();
    expect(sent).toEqual([{ email: 'ada@example.com', subject: 'Daily digest - 2026-11-03' }]);
    const after = await methods.getResearchJobById(job.id);
    expect(after?.deliveries).toEqual([
      expect.objectContaining({ channel: 'email', state: 'sent' }),
    ]);
  });

  it('unlocks detached documents and scheduling for jobs 1 and 5 with delegated access', async () => {
    const detachedCalls: string[] = [];
    const research = host({
      delegatedAccess: {
        createMcpCaller:
          () =>
          async ({ toolArguments }) => {
            detachedCalls.push(String((toolArguments as { reference?: string }).reference));
            return { content: [{ type: 'text', text: 'Detached doc body' }] };
          },
      },
    });
    const fire = request({
      _isAgentTrigger: true,
      body: {
        ...request().body,
        agent_id: RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION],
        clientRequestId: 'trigger-solution',
        agentTrigger: {
          version: 1,
          event: {
            type: 'schedule.occurrence',
            occurredAt: Date.parse('2026-11-03T00:00:00.000Z'),
            source: { type: 'schedule', id: 'sched-solution' },
          },
        },
      },
    } as Partial<ResearchRequest>);
    const admitted = await research.admitRequest(fire, conversationId);
    expect(admitted?.ok).toBe(true);

    const reference = 'https://contoso.sharepoint.com/sites/x/spec.docx';
    const continuation = request({ _isAgentTrigger: true });
    const tools = await research.createTools(continuation);
    const output = String(
      await tools.find((t) => t.name === 'read_document')!.invoke({ reference }),
    );
    expect(output).toContain('snapshot_id');
    expect(detachedCalls).toEqual([reference]);
  });

  it('keeps detached documents refused without delegated access', async () => {
    const research = host();
    const refused = await research
      .admitOrThrow(
        request({
          _isAgentTrigger: true,
          body: {
            ...request().body,
            agent_id: RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION],
            agentTrigger: {
              version: 1,
              event: {
                type: 'schedule.occurrence',
                occurredAt: 0,
                source: { type: 'schedule', id: 'sched-solution' },
              },
            },
          },
        } as Partial<ResearchRequest>),
        conversationId,
      )
      .catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: 'research_job_not_schedulable' });
  });

  it('ensures research and feed indexes at boot, for deployments without autoIndex', async () => {
    const names = async (model: string) =>
      (await mongoose.models[model].collection.indexes()).map((i) => i.name);
    await mongoose.models.Feed.createCollection();
    await mongoose.models.ResearchSchedule.createCollection();
    await mongoose.models.Feed.collection.dropIndexes();
    await mongoose.models.ResearchSchedule.collection.dropIndexes();
    expect(await names('Feed')).toEqual(['_id_']);
    await host().seed();
    expect((await names('Feed')).length).toBeGreaterThan(1);
    expect((await names('ResearchSchedule')).length).toBeGreaterThan(1);
  });

  it('keeps delivering while a feed poll hangs', async () => {
    const hanging = http.createServer(() => undefined);
    await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', resolve));
    const { port } = hanging.address() as AddressInfo;
    const stops: Array<() => void> = [];
    try {
      const feed = await methods.upsertFeed({ url: `http://127.0.0.1:${port}/feed.xml` });
      await methods.subscribeToFeed(userId, feed.id, { source: 'opml' });
      await mongoose.models.User.create({
        _id: new mongoose.Types.ObjectId(userId),
        email: 'ada@example.com',
        emailVerified: true,
        provider: 'local',
      });
      const snapshot = await methods.createSnapshot({
        id: 'report_hang',
        user: new mongoose.Types.ObjectId(userId),
        sourceKind: 'priorReport',
        reference: 'report:hang',
        storageKey: 'k',
        fileStrategy: 'memory',
        contentHash: 'h',
        fetchedAt: new Date(),
        archived: true,
      });
      const job = await methods.createResearchJob({
        id: 'research_hang',
        user: new mongoose.Types.ObjectId(userId),
        agentId: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST],
        jobType: ResearchJobType.DIGEST,
        invocationMode: 'delegated',
        status: 'delivered',
        prompt: 'Digest',
        conversationId,
        budget: { wallClockMinutes: 10, maxSteps: 120 },
        reportSnapshotId: snapshot.id,
      } as never);
      const sent: string[] = [];
      const research = host({
        getAppConfig: async () =>
          ({
            researcher: researchSchema.parse({
              enabled: true,
              fetch: { allowedAddresses: [`127.0.0.1:${port}`] },
            }),
          }) as ResearchAppConfig,
        getStorage: () => ({
          save: async ({ key }) => ({ storageKey: key, fileStrategy: 'memory' }),
          read: async () => '# Digest',
          remove: async () => undefined,
        }),
        email: {
          sendEmail: async (params) => {
            sent.push(params.email);
          },
          appUrl: 'https://chat.example.com',
        },
      });
      stops.push(research.start({ tickMs: 25 }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      await methods.queueResearchDeliveries(job.id, ['email'], new Date(0));
      const deadline = Date.now() + 3000;
      while (sent.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(sent).toEqual(['ada@example.com']);
    } finally {
      stops.forEach((stop) => stop());
      hanging.closeAllConnections();
      await new Promise<void>((resolve) => hanging.close(() => resolve()));
    }
  });

  it('builds no tools when research is disabled for the caller', async () => {
    const tools = await host().createTools(
      request({ config: { researcher: researchSchema.parse({}) } as ResearchAppConfig }),
    );
    expect(tools).toEqual([]);
  });
});
