import { researchSchema } from '../../src/contract/research';
import {
  getJobBudget,
  computeDeadlines,
  remainingSteps,
  seedRecursionLimit,
  isStepBudgetExhausted,
} from '../../src/server/budget';
import { ResearchJobType } from '../../src/contract/types';

const config = researchSchema.parse({});

describe('research budgets', () => {
  it('reads the per-job budget from config', () => {
    expect(getJobBudget(config, ResearchJobType.SOLUTION)).toEqual({
      wallClockMinutes: 60,
      maxSteps: 500,
    });
    expect(getJobBudget(config, ResearchJobType.DIGEST)).toEqual({
      wallClockMinutes: 15,
      maxSteps: 200,
    });
  });

  it('places the draft point at the configured fraction of the wall clock', () => {
    const start = new Date('2026-11-03T00:00:00.000Z');
    const { draftAt, deadlineAt } = computeDeadlines(
      start,
      { wallClockMinutes: 100, maxSteps: 10 },
      0.85,
    );
    expect(draftAt.toISOString()).toBe('2026-11-03T01:25:00.000Z');
    expect(deadlineAt.toISOString()).toBe('2026-11-03T01:40:00.000Z');
  });

  it('counts remaining steps and never goes negative', () => {
    expect(
      remainingSteps({
        budget: { wallClockMinutes: 1, maxSteps: 10 },
        budgetUsed: { elapsedMs: 0, steps: 4 },
      }),
    ).toBe(6);
    expect(
      remainingSteps({
        budget: { wallClockMinutes: 1, maxSteps: 10 },
        budgetUsed: { elapsedMs: 0, steps: 14 },
      }),
    ).toBe(0);
    expect(
      isStepBudgetExhausted({
        budget: { wallClockMinutes: 1, maxSteps: 10 },
        budgetUsed: { elapsedMs: 0, steps: 10 },
      }),
    ).toBe(true);
  });

  it('caps the seeded per-generation recursion limit by the deployment maximum', () => {
    expect(seedRecursionLimit(400, 100)).toBe(100);
    expect(seedRecursionLimit(120, undefined)).toBe(120);
    expect(seedRecursionLimit(120, 500)).toBe(120);
  });
});
