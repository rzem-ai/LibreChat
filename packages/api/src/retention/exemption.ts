// Deloitte Custom Change: Retention Update
import type { IAgent, ISkillDocument } from '@librechat/data-schemas';

const MAX_REASON_LENGTH = 500;

export interface RetentionExceptionInput {
  exempt: boolean;
  reason?: string;
}

/** HTTP-shaped outcome the thin admin route wrapper serializes verbatim. */
export interface RetentionExceptionResult {
  status: number;
  body: Record<string, unknown>;
}

type ValidatedBody =
  | { ok: true; value: RetentionExceptionInput }
  | { ok: false; status: number; body: Record<string, unknown> };

function validateRetentionExceptionBody(body: unknown): ValidatedBody {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, status: 400, body: { code: 'INVALID_BODY' } };
  }
  const { exempt, reason } = body as Record<string, unknown>;
  if (typeof exempt !== 'boolean') {
    return { ok: false, status: 400, body: { code: 'INVALID_EXEMPT' } };
  }
  if (
    reason !== undefined &&
    (typeof reason !== 'string' || reason.length === 0 || reason.length > MAX_REASON_LENGTH)
  ) {
    return { ok: false, status: 400, body: { code: 'INVALID_REASON' } };
  }
  return { ok: true, value: { exempt, reason } };
}

export interface AgentRetentionExceptionDeps {
  /** Admin-scoped, unconditional retention-exception write (`db.setAgentRetentionException`-shaped). */
  setAgentRetentionException: (
    agentId: string,
    update: { exempt: boolean; reason?: string; setBy: string; setAt: Date },
  ) => Promise<Pick<IAgent, 'id' | 'retentionException'> | null>;
}

/**
 * Admin-only carve-out from retention: unlike sharing (which never affects
 * eligibility), this is the one explicit lever that permanently exempts a
 * specific agent from the purge sweep, independent of promotion/catalog status.
 */
export async function handleSetAgentRetentionException(
  adminUserId: string,
  agentId: unknown,
  body: unknown,
  deps: AgentRetentionExceptionDeps,
): Promise<RetentionExceptionResult> {
  if (typeof agentId !== 'string' || agentId.length === 0) {
    return { status: 400, body: { code: 'INVALID_AGENT_ID' } };
  }
  const validated = validateRetentionExceptionBody(body);
  if (!validated.ok) {
    return { status: validated.status, body: validated.body };
  }
  const agent = await deps.setAgentRetentionException(agentId, {
    ...validated.value,
    setBy: adminUserId,
    setAt: new Date(),
  });
  if (!agent) {
    return { status: 404, body: { code: 'AGENT_NOT_FOUND' } };
  }
  return { status: 200, body: { agent } };
}

export interface SkillRetentionExceptionDeps {
  /** Admin-scoped, unconditional retention-exception write (`db.setSkillRetentionException`-shaped). */
  setSkillRetentionException: (
    skillId: string,
    update: { exempt: boolean; reason?: string; setBy: string; setAt: Date },
  ) => Promise<Pick<ISkillDocument, 'retentionException'> | null>;
}

/** Same admin-only carve-out as {@link handleSetAgentRetentionException}, for skills. */
export async function handleSetSkillRetentionException(
  adminUserId: string,
  skillId: unknown,
  body: unknown,
  deps: SkillRetentionExceptionDeps,
): Promise<RetentionExceptionResult> {
  if (typeof skillId !== 'string' || skillId.length === 0) {
    return { status: 400, body: { code: 'INVALID_SKILL_ID' } };
  }
  const validated = validateRetentionExceptionBody(body);
  if (!validated.ok) {
    return { status: validated.status, body: validated.body };
  }
  const skill = await deps.setSkillRetentionException(skillId, {
    ...validated.value,
    setBy: adminUserId,
    setAt: new Date(),
  });
  if (!skill) {
    return { status: 404, body: { code: 'SKILL_NOT_FOUND' } };
  }
  return { status: 200, body: { skill } };
}
