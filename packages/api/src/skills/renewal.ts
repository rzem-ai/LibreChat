import type { ISkill, ISkillDocument } from '@librechat/data-schemas';

export interface SkillRenewalUser {
  id?: string;
  tenantId?: string;
}

export interface SkillRenewalBody {
  skill_id?: unknown;
}

/** HTTP-shaped outcome the thin route wrapper serializes verbatim. */
export interface SkillRenewalResult {
  status: number;
  body: Record<string, unknown>;
}

export interface SkillRenewalDeps {
  /** Owner-scoped activity re-stamp (`db.renewSkillActivity`-shaped). */
  renewSkillActivity: (
    id: string,
    author: string,
    retentionHours: number,
  ) => Promise<ISkill | null>;
  /** Configured agent-retention window, shared with agents. */
  retentionHours: number;
}

/**
 * Renews a private inline skill's independent retention deadline. Renewal is
 * just an explicit activity event, so it reuses the same stamping recompute
 * the hot-path touch uses, scoped to the owning author.
 */
export async function handleSkillRenewRequest(
  user: SkillRenewalUser,
  body: SkillRenewalBody,
  deps: SkillRenewalDeps,
): Promise<SkillRenewalResult> {
  if (!user.id) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  const { skill_id } = body;
  if (typeof skill_id !== 'string' || skill_id.length === 0) {
    return { status: 400, body: { code: 'INVALID_SKILL_ID' } };
  }
  const skill = await deps.renewSkillActivity(skill_id, user.id, deps.retentionHours);
  if (!skill) {
    return { status: 404, body: { code: 'SKILL_NOT_FOUND' } };
  }
  return { status: 200, body: { skill } };
}

export interface SkillsExpiringSoonDeps {
  /** Owner-scoped expiring-soon lookup (`db.getSkillsExpiringSoon`-shaped). */
  getSkillsExpiringSoon: (
    owner: { userId: string; tenantId?: string | null },
    withinMs: number,
    options?: { now?: Date; limit?: number },
  ) => Promise<
    Array<Pick<ISkillDocument, '_id' | 'name' | 'author' | 'source' | 'tenantId' | 'expiredAt'>>
  >;
  /** Warning window; always resolved by `getAgentRetentionWarningHours` upstream. */
  retentionWarningHours: number;
}

/**
 * Lists the authenticated user's own private inline skills expiring within
 * the configured warning window, so the client can render a renewal prompt
 * before the sweep deletes them.
 */
export async function handleSkillsExpiringSoonRequest(
  user: SkillRenewalUser,
  deps: SkillsExpiringSoonDeps,
): Promise<SkillRenewalResult> {
  if (!user.id) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  const withinMs = deps.retentionWarningHours * 60 * 60 * 1000;
  const skills = await deps.getSkillsExpiringSoon(
    { userId: user.id, tenantId: user.tenantId },
    withinMs,
  );
  return { status: 200, body: { skills } };
}
