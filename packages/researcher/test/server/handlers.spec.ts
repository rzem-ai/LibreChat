import type { Request, Response } from 'express';
import type { ResearchService } from '../../src/server/service';
import type { IResearchJob } from '../../src/db';
import { createResearchHandlers, toResearchJobResponse } from '../../src/server/handlers';
import { ResearchJobType } from '../../src/contract/types';

const job = {
  id: 'research_1',
  user: 'u1',
  agentId: 'agent_research_digest',
  jobType: ResearchJobType.DIGEST,
  invocationMode: 'interactive',
  status: 'researching',
  partial: false,
  prompt: 'Digest my feeds',
  brief: 'Brief',
  draft: 'secret draft',
  notes: [{ claim: 'c', snapshotId: 's' }],
  budget: { wallClockMinutes: 10, maxSteps: 120 },
  budgetUsed: { elapsedMs: 1000, steps: 3 },
  conversationId: 'c1',
  inputSnapshotIds: [],
  citedSnapshotIds: ['s'],
  deliveries: [],
  phaseDeliveryKey: 'trigger_x',
  knownUrlHashes: ['h'],
  leaseBy: 'node-1',
  createdAt: new Date('2026-11-03T00:00:00.000Z'),
  updatedAt: new Date('2026-11-03T00:01:00.000Z'),
} as unknown as IResearchJob;

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: jest.Mock;
  json: jest.Mock;
};

function response(): MockResponse & Response {
  const res = { statusCode: 200, body: undefined } as MockResponse;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res as MockResponse & Response;
}

const req = (params: Record<string, string> = {}) =>
  ({ user: { id: 'u1' }, params }) as unknown as Request;

function service(overrides: Partial<ResearchService> = {}): ResearchService {
  return {
    listJobs: jest.fn(async () => [job]),
    getJob: jest.fn(async (id: string) => (id === job.id ? job : null)),
    cancel: jest.fn(async () => 'cancelled' as const),
    ...overrides,
  } as unknown as ResearchService;
}

describe('toResearchJobResponse deliveries', () => {
  it('carries each channel state, attempts and failure code, but no due time', () => {
    const response = toResearchJobResponse({
      ...job,
      deliveries: [
        { channel: 'conversation', state: 'sent' },
        {
          channel: 'email',
          state: 'failed',
          attempts: 5,
          error: 'email_failed',
          nextAttemptAt: new Date('2026-11-03T00:00:00.000Z'),
          updatedAt: new Date('2026-11-03T00:05:00.000Z'),
        },
      ],
    } as unknown as IResearchJob);
    expect(response.deliveries).toEqual([
      { channel: 'conversation', state: 'sent' },
      {
        channel: 'email',
        state: 'failed',
        attempts: 5,
        error: 'email_failed',
        updatedAt: '2026-11-03T00:05:00.000Z',
      },
    ]);
  });
});

describe('toResearchJobResponse', () => {
  const startedAt = new Date('2026-11-03T00:00:00.000Z');

  it('reports elapsed time from start to completion for a finished job', () => {
    const finished = {
      ...job,
      status: 'delivered',
      startedAt,
      completedAt: new Date('2026-11-03T00:05:30.000Z'),
    } as IResearchJob;
    expect(toResearchJobResponse(finished).budgetUsed).toEqual({ elapsedMs: 330_000, steps: 3 });
  });

  it('reports elapsed time so far for a running job', () => {
    const running = { ...job, startedAt } as IResearchJob;
    const now = new Date('2026-11-03T00:02:00.000Z');
    expect(toResearchJobResponse(running, now).budgetUsed.elapsedMs).toBe(120_000);
  });

  it('leaves out drafts, notes and internal fields', () => {
    const wire = toResearchJobResponse(job);
    expect(wire).toMatchObject({ id: 'research_1', findingsCount: 1, citedCount: 1 });
    const text = JSON.stringify(wire);
    for (const hidden of ['secret draft', 'trigger_x', 'knownUrlHashes', 'node-1', '"user"']) {
      expect(text).not.toContain(hidden);
    }
  });
});

describe('createResearchHandlers', () => {
  it("lists only the caller's jobs", async () => {
    const svc = service();
    const res = response();
    await createResearchHandlers({ service: svc }).listJobs(req(), res);
    expect(svc.listJobs).toHaveBeenCalledWith('u1');
    expect((res.body as { jobs: unknown[] }).jobs).toHaveLength(1);
  });

  it('returns 404 with a stable code for a job the caller does not own', async () => {
    const svc = service();
    const res = response();
    await createResearchHandlers({ service: svc }).getJob(req({ jobId: 'other' }), res);
    expect(svc.getJob).toHaveBeenCalledWith('other', 'u1');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error_code: 'research_job_not_found' });
  });

  it('maps cancel outcomes to responses', async () => {
    const handlers = (result: 'cancelled' | 'terminal' | 'missing') =>
      createResearchHandlers({ service: service({ cancel: jest.fn(async () => result) }) });
    const ok = response();
    await handlers('cancelled').cancelJob(req({ jobId: job.id }), ok);
    expect(ok.statusCode).toBe(200);
    expect((ok.body as { id: string }).id).toBe(job.id);
    const done = response();
    await handlers('terminal').cancelJob(req({ jobId: job.id }), done);
    expect(done.statusCode).toBe(409);
    expect(done.body).toEqual({ error_code: 'research_job_finished' });
    const gone = response();
    await handlers('missing').cancelJob(req({ jobId: job.id }), gone);
    expect(gone.statusCode).toBe(404);
  });

  it('answers a service failure with a generic 500 and no internals', async () => {
    const res = response();
    await createResearchHandlers({
      service: service({
        listJobs: jest.fn(async () => {
          throw new Error('mongo exploded at host db-1');
        }),
      }),
    }).listJobs(req(), res);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('db-1');
  });
});
