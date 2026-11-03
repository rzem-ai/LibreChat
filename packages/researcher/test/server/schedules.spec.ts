import mongoose from 'mongoose';
import { researchSchema } from '../../src/contract/research';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { TResearchSchedulesResponse } from '../../src/contract/types';
import type { ResearchHostMethods } from '../../src/db';
import { ResearchJobType, RESEARCH_AGENT_IDS } from '../../src/contract/types';
import { createResearchDbMethods, createResearchModels } from '../../src/db';
import { createResearchScheduleHandlers } from '../../src/server/schedules';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;
const userId = new mongoose.Types.ObjectId().toString();
const otherUser = new mongoose.Types.ObjectId().toString();
let research = researchSchema.parse({ enabled: true });

type MockResponse = Response & { statusCode: number; body: unknown };

function response(): MockResponse {
  const state = { statusCode: 200, body: undefined as unknown };
  const res: Record<string, unknown> = state;
  res.status = jest.fn((code: number) => {
    state.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    state.body = body;
    return res;
  });
  return res as unknown as MockResponse;
}

function req(input: { params?: Record<string, string>; body?: unknown; user?: string } = {}) {
  return {
    user: { id: input.user ?? userId },
    params: input.params ?? {},
    body: input.body ?? {},
    config: { research },
  } as unknown as Request;
}

async function schedule(id: string, agentId: string, user = userId) {
  await mongoose.models.Schedule.create({
    id,
    user: new mongoose.Types.ObjectId(user),
    name: `Schedule ${id}`,
    prompt: 'Widgets',
    agent_id: agentId,
    cadence: { frequency: 'daily', hour: 8, minute: 0 },
    timezone: 'Australia/Sydney',
    target: 'new',
    enabled: true,
  });
}

const handlers = (emailAvailable = true, delegated?: { teams: boolean }) =>
  createResearchScheduleHandlers({
    methods,
    emailAvailable: () => emailAvailable,
    ...(delegated ? { delegatedDocuments: true, teamsAvailable: () => delegated.teams } : {}),
  });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  methods = { ...createMethods(mongoose), ...createResearchDbMethods(mongoose) };
  await mongoose.models.ResearchSchedule.init();
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  research = researchSchema.parse({ enabled: true });
  await mongoose.models.Schedule.deleteMany({});
  await mongoose.models.ResearchSchedule.deleteMany({});
});

describe('createResearchScheduleHandlers', () => {
  it('lists the caller’s research schedules with their channels and what can be offered', async () => {
    await schedule('s-digest', RESEARCH_AGENT_IDS[ResearchJobType.DIGEST]);
    await schedule('s-trends', RESEARCH_AGENT_IDS[ResearchJobType.TRENDS]);
    await schedule('s-other', 'agent_not_research');
    await schedule('s-theirs', RESEARCH_AGENT_IDS[ResearchJobType.DIGEST], otherUser);
    await methods.upsertResearchSchedule({
      scheduleId: 's-digest',
      user: userId,
      jobType: ResearchJobType.DIGEST,
      channels: ['conversation', 'email'],
    });
    const res = response();
    await handlers().listSchedules(req(), res);
    const body = res.body as TResearchSchedulesResponse;
    expect(body.schedules.map((s) => s.scheduleId).sort()).toEqual(['s-digest', 's-trends']);
    expect(body.schedules.find((s) => s.scheduleId === 's-digest')).toMatchObject({
      name: 'Schedule s-digest',
      jobType: ResearchJobType.DIGEST,
      enabled: true,
      channels: ['conversation', 'email'],
      availableChannels: ['conversation', 'email'],
    });
    expect(body.schedules.find((s) => s.scheduleId === 's-trends')?.channels).toEqual([
      'conversation',
    ]);
  });

  it('offers only the conversation when email is off or unconfigured', async () => {
    await schedule('s-digest', RESEARCH_AGENT_IDS[ResearchJobType.DIGEST]);
    const unconfigured = response();
    await handlers(false).listSchedules(req(), unconfigured);
    expect(
      (unconfigured.body as TResearchSchedulesResponse).schedules[0].availableChannels,
    ).toEqual(['conversation']);
    research = researchSchema.parse({ enabled: true, delivery: { email: false } });
    const disabled = response();
    await handlers(true).listSchedules(req(), disabled);
    expect((disabled.body as TResearchSchedulesResponse).schedules[0].availableChannels).toEqual([
      'conversation',
    ]);
  });

  it('saves channels for the caller’s research schedule, always keeping the conversation', async () => {
    await schedule('s-digest', RESEARCH_AGENT_IDS[ResearchJobType.DIGEST]);
    const res = response();
    await handlers().updateSchedule(
      req({ params: { scheduleId: 's-digest' }, body: { channels: ['email'] } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ scheduleId: 's-digest', channels: ['conversation', 'email'] });
    expect((await methods.getResearchSchedule('s-digest', userId))?.channels).toEqual([
      'conversation',
      'email',
    ]);
  });

  it('refuses a channel the deployment cannot send', async () => {
    await schedule('s-digest', RESEARCH_AGENT_IDS[ResearchJobType.DIGEST]);
    for (const channels of [['teams'], ['carrier-pigeon'], 'email']) {
      const res = response();
      await handlers().updateSchedule(
        req({ params: { scheduleId: 's-digest' }, body: { channels } }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error_code: 'research_channel_unavailable' });
    }
    expect(await methods.getResearchSchedule('s-digest', userId)).toBeNull();
  });

  it('answers 404 for another user’s schedule or one whose agent is not research', async () => {
    await schedule('s-theirs', RESEARCH_AGENT_IDS[ResearchJobType.DIGEST], otherUser);
    await schedule('s-other', 'agent_not_research');
    for (const scheduleId of ['s-theirs', 's-other', 's-missing']) {
      const res = response();
      await handlers().updateSchedule(
        req({ params: { scheduleId }, body: { channels: ['conversation'] } }),
        res,
      );
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error_code: 'research_schedule_not_found' });
    }
    expect(await mongoose.models.ResearchSchedule.countDocuments()).toBe(0);
  });

  it('resets a schedule to conversation-only delivery', async () => {
    await schedule('s-digest', RESEARCH_AGENT_IDS[ResearchJobType.DIGEST]);
    await methods.upsertResearchSchedule({
      scheduleId: 's-digest',
      user: userId,
      jobType: ResearchJobType.DIGEST,
      channels: ['conversation', 'email'],
    });
    const res = response();
    await handlers().resetSchedule(req({ params: { scheduleId: 's-digest' } }), res);
    expect(res.body).toMatchObject({ scheduleId: 's-digest', channels: ['conversation'] });
    expect(await methods.getResearchSchedule('s-digest', userId)).toBeNull();
  });

  it('offers jobs 1 and 5 and Teams only with the gateway token provider', async () => {
    research = researchSchema.parse({ enabled: true, delivery: { teams: true } });
    await schedule('s-solution', RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION]);
    const without = response();
    await handlers().listSchedules(req(), without);
    expect((without.body as TResearchSchedulesResponse).schedules).toEqual([]);

    const withProvider = response();
    await handlers(true, { teams: true }).listSchedules(req(), withProvider);
    expect((withProvider.body as TResearchSchedulesResponse).schedules[0]).toMatchObject({
      scheduleId: 's-solution',
      availableChannels: ['conversation', 'email', 'teams'],
    });
  });
});
