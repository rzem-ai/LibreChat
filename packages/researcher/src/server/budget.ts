import type { TResearchConfig } from '../contract/research';
import type { IResearchBudget, IResearchBudgetUsed } from '../db';
import type { ResearchJobType } from '../contract/types';

const MINUTE_MS = 60_000;

type BudgetedJob = { budget: IResearchBudget; budgetUsed: IResearchBudgetUsed };

export function getJobBudget(config: TResearchConfig, jobType: ResearchJobType): IResearchBudget {
  const { wallClockMinutes, maxSteps } = config.jobs[jobType];
  return { wallClockMinutes, maxSteps };
}

/** `draftAt` is when research stops and drafting begins; `deadlineAt` ends the budget. */
export function computeDeadlines(
  startedAt: Date,
  budget: IResearchBudget,
  draftThreshold: number,
): { draftAt: Date; deadlineAt: Date } {
  const totalMs = budget.wallClockMinutes * MINUTE_MS;
  return {
    draftAt: new Date(startedAt.getTime() + Math.floor(totalMs * draftThreshold)),
    deadlineAt: new Date(startedAt.getTime() + totalMs),
  };
}

export function remainingSteps(job: BudgetedJob): number {
  return Math.max(0, job.budget.maxSteps - job.budgetUsed.steps);
}

export function isStepBudgetExhausted(job: BudgetedJob): boolean {
  return remainingSteps(job) === 0;
}

/** Per-generation superstep cap for a seeded agent, bounded by `maxRecursionLimit`. */
export function seedRecursionLimit(
  maxSteps: number,
  maxRecursionLimit: number | undefined,
): number {
  return maxRecursionLimit != null ? Math.min(maxSteps, maxRecursionLimit) : maxSteps;
}
