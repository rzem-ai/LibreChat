import { logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { TResearchJob } from '../contract/types';
import type { ResearchService } from './service';
import type { IResearchJob } from '../db';

type AuthedRequest = Request & { user?: { id?: string } };

function iso(value: Date | string | undefined): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

/** Wall-clock time from start to completion, or to `now` while the job runs. */
function elapsedMs(job: IResearchJob, now: Date): number {
  if (!job.startedAt) {
    return job.budgetUsed.elapsedMs;
  }
  const end = job.completedAt ? new Date(job.completedAt) : now;
  return Math.max(0, end.getTime() - new Date(job.startedAt).getTime());
}

/** The owner's view of a job: no drafts, notes, leases, phase keys or URL hashes. */
export function toResearchJobResponse(job: IResearchJob, now: Date = new Date()): TResearchJob {
  return {
    id: job.id,
    agentId: job.agentId,
    jobType: job.jobType,
    invocationMode: job.invocationMode,
    status: job.status,
    partial: job.partial,
    prompt: job.prompt,
    ...(job.brief ? { brief: job.brief } : {}),
    budget: job.budget,
    budgetUsed: { steps: job.budgetUsed.steps, elapsedMs: elapsedMs(job, now) },
    conversationId: job.conversationId,
    ...(job.reportFileId ? { reportFileId: job.reportFileId } : {}),
    findingsCount: job.notes?.length ?? 0,
    citedCount: job.citedSnapshotIds?.length ?? 0,
    ...(job.verification ? { verification: job.verification } : {}),
    deliveries: (job.deliveries ?? []).map((delivery) => ({
      channel: delivery.channel,
      state: delivery.state,
      ...(delivery.attempts ? { attempts: delivery.attempts } : {}),
      ...(delivery.error ? { error: delivery.error } : {}),
      ...(delivery.updatedAt ? { updatedAt: iso(delivery.updatedAt) } : {}),
    })),
    ...(job.scheduleId ? { scheduleId: job.scheduleId } : {}),
    ...(job.failureReason ? { failureReason: job.failureReason } : {}),
    ...(job.startedAt ? { startedAt: iso(job.startedAt) } : {}),
    ...(job.completedAt ? { completedAt: iso(job.completedAt) } : {}),
    createdAt: iso(job.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(job.updatedAt) ?? new Date(0).toISOString(),
  };
}

function fail(res: Response, context: string, error: unknown): void {
  logger.error(`[research] ${context}`, error);
  res.status(500).json({ error_code: 'research_unavailable' });
}

export type ResearchHandlers = {
  listJobs: (req: AuthedRequest, res: Response) => Promise<void>;
  getJob: (req: AuthedRequest, res: Response) => Promise<void>;
  cancelJob: (req: AuthedRequest, res: Response) => Promise<void>;
};

/** HTTP handlers for the owner's research jobs. Every lookup is scoped to `req.user`. */
export function createResearchHandlers(deps: {
  service: Pick<ResearchService, 'listJobs' | 'getJob' | 'cancel'>;
}): ResearchHandlers {
  const { service } = deps;

  async function listJobs(req: AuthedRequest, res: Response): Promise<void> {
    try {
      const jobs = await service.listJobs(String(req.user?.id));
      const now = new Date();
      res.json({ jobs: jobs.map((job) => toResearchJobResponse(job, now)) });
    } catch (error) {
      fail(res, 'Failed to list research jobs', error);
    }
  }

  async function getJob(req: AuthedRequest, res: Response): Promise<void> {
    try {
      const job = await service.getJob(req.params.jobId, String(req.user?.id));
      if (!job) {
        res.status(404).json({ error_code: 'research_job_not_found' });
        return;
      }
      res.json(toResearchJobResponse(job));
    } catch (error) {
      fail(res, 'Failed to read a research job', error);
    }
  }

  async function cancelJob(req: AuthedRequest, res: Response): Promise<void> {
    try {
      const userId = String(req.user?.id);
      const result = await service.cancel(req.params.jobId, userId);
      if (result === 'missing') {
        res.status(404).json({ error_code: 'research_job_not_found' });
        return;
      }
      if (result === 'terminal') {
        res.status(409).json({ error_code: 'research_job_finished' });
        return;
      }
      const job = await service.getJob(req.params.jobId, userId);
      res.json(job ? toResearchJobResponse(job) : { id: req.params.jobId });
    } catch (error) {
      fail(res, 'Failed to cancel a research job', error);
    }
  }

  return { listJobs, getJob, cancelJob };
}
