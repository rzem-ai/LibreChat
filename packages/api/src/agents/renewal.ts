import type { IAgent } from '@librechat/data-schemas';

export interface AgentRenewalUser {
  id?: string;
  tenantId?: string;
}

export interface AgentRenewalBody {
  agent_id?: unknown;
}

/** HTTP-shaped outcome the thin route wrapper serializes verbatim. */
export interface AgentRenewalResult {
  status: number;
  body: Record<string, unknown>;
}

export interface AgentRenewalDeps {
  /** Owner-scoped activity re-stamp (`db.renewAgentActivity`-shaped). */
  renewAgentActivity: (
    searchParameter: { id: string; author: string; tenantId?: string },
    retentionHours: number,
  ) => Promise<IAgent | null>;
  /** Configured agent-retention window, shared with skills. */
  agentRetentionHours: number;
}

/**
 * Renews a private agent's independent retention deadline. Renewal is just
 * an explicit activity event, so it reuses the same stamping recompute the
 * hot-path touch uses, scoped to the owning author.
 */
export async function handleAgentRenewRequest(
  user: AgentRenewalUser,
  body: AgentRenewalBody,
  deps: AgentRenewalDeps,
): Promise<AgentRenewalResult> {
  if (!user.id) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  const { agent_id } = body;
  if (typeof agent_id !== 'string' || agent_id.length === 0) {
    return { status: 400, body: { code: 'INVALID_AGENT_ID' } };
  }
  const agent = await deps.renewAgentActivity(
    { id: agent_id, author: user.id, tenantId: user.tenantId },
    deps.agentRetentionHours,
  );
  if (!agent) {
    return { status: 404, body: { code: 'AGENT_NOT_FOUND' } };
  }
  return { status: 200, body: { agent } };
}

export interface AgentsExpiringSoonDeps {
  /** Owner-scoped expiring-soon lookup (`db.getAgentsExpiringSoon`-shaped). */
  getAgentsExpiringSoon: (
    owner: { userId: string; tenantId?: string | null },
    withinMs: number,
    options?: { now?: Date; limit?: number },
  ) => Promise<
    Array<Pick<IAgent, '_id' | 'id' | 'name' | 'author' | 'is_promoted' | 'tenantId' | 'expiredAt'>>
  >;
  /** Warning window; always resolved by `getAgentRetentionWarningHours` upstream. */
  agentRetentionWarningHours: number;
}

/**
 * Lists the authenticated user's own private agents expiring within the
 * configured warning window, so the client can render a renewal prompt
 * before the sweep deletes them.
 */
export async function handleAgentsExpiringSoonRequest(
  user: AgentRenewalUser,
  deps: AgentsExpiringSoonDeps,
): Promise<AgentRenewalResult> {
  if (!user.id) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  const withinMs = deps.agentRetentionWarningHours * 60 * 60 * 1000;
  const agents = await deps.getAgentsExpiringSoon(
    { userId: user.id, tenantId: user.tenantId },
    withinMs,
  );
  return { status: 200, body: { agents } };
}
