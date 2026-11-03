import type { Request, Response } from 'express';
import type { TResearchStatus } from '../contract/types';
import type { ResearchAppConfig } from './config';
import { researchJobTypeForAgent } from '../contract/types';
import { getResearchConfig } from './config';

type ResearchSection = Pick<ResearchAppConfig, 'researcher'> | undefined;

const fromFile = (): ResearchSection => ({ researcher: getResearchConfig() });

/** The only research state the client needs: whether to show research entry points. */
export function getResearchStartupConfig(
  appConfig: ResearchSection = fromFile(),
): { enabled: boolean } | undefined {
  return appConfig?.researcher?.enabled ? { enabled: true } : undefined;
}

/**
 * The five seeded research agents cannot be deleted while research is enabled: schedules
 * and jobs reference their fixed ids, and the seeder recreates them on the next start
 * anyway. Turning research off lifts the guard so an operator can clean up.
 */
export function isProtectedResearchAgent(
  appConfig: ResearchSection,
  agentId: string | undefined,
): boolean {
  return appConfig?.researcher?.enabled === true && researchJobTypeForAgent(agentId) !== undefined;
}

/** `GET /api/research/status`: whether the client should show research entry points. */
export function researchStatusHandler(_req: Request, res: Response): void {
  const status: TResearchStatus = { enabled: getResearchStartupConfig()?.enabled === true };
  res.json(status);
}
