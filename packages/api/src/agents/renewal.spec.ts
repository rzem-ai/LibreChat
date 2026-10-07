import { handleAgentRenewRequest, handleAgentsExpiringSoonRequest } from './renewal';

describe('handleAgentRenewRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };

  const createDeps = (agent: Record<string, unknown> | null = { id: 'agent-1' }) => ({
    renewAgentActivity: jest.fn().mockResolvedValue(agent),
    agentRetentionHours: 2160,
  });

  it('rejects unauthenticated requests without touching the DB', async () => {
    const deps = createDeps();
    const result = await handleAgentRenewRequest({}, { agent_id: 'agent-1' }, deps);
    expect(result).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
    expect(deps.renewAgentActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['not a string', { agent_id: 42 }],
    ['empty string', { agent_id: '' }],
  ])('rejects %s agent_id with 400', async (_label, body) => {
    const deps = createDeps();
    const result = await handleAgentRenewRequest(user, body, deps);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ code: 'INVALID_AGENT_ID' });
    expect(deps.renewAgentActivity).not.toHaveBeenCalled();
  });

  it('renews as an owner-scoped activity re-stamp', async () => {
    const deps = createDeps({ id: 'agent-1', expiredAt: new Date() });
    const result = await handleAgentRenewRequest(user, { agent_id: 'agent-1' }, deps);
    expect(deps.renewAgentActivity).toHaveBeenCalledWith({ id: 'agent-1', author: 'user-1' }, 2160);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ agent: { id: 'agent-1', expiredAt: expect.any(Date) } });
  });

  it('returns 404 when the agent does not resolve under the owner scope', async () => {
    const deps = createDeps(null);
    const result = await handleAgentRenewRequest(user, { agent_id: 'not-owned' }, deps);
    expect(result).toEqual({ status: 404, body: { code: 'AGENT_NOT_FOUND' } });
  });
});

describe('handleAgentsExpiringSoonRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };

  it('rejects unauthenticated requests without touching the DB', async () => {
    const getAgentsExpiringSoon = jest.fn();
    const result = await handleAgentsExpiringSoonRequest(
      {},
      { getAgentsExpiringSoon, agentRetentionWarningHours: 168 },
    );
    expect(result).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
    expect(getAgentsExpiringSoon).not.toHaveBeenCalled();
  });

  it('lists the owner-scoped agents within the configured warning window', async () => {
    const agents = [{ id: 'agent-1' }];
    const getAgentsExpiringSoon = jest.fn().mockResolvedValue(agents);
    const result = await handleAgentsExpiringSoonRequest(user, {
      getAgentsExpiringSoon,
      agentRetentionWarningHours: 168,
    });
    expect(getAgentsExpiringSoon).toHaveBeenCalledWith(
      { userId: 'user-1', tenantId: 'tenant-1' },
      168 * 60 * 60 * 1000,
    );
    expect(result).toEqual({ status: 200, body: { agents } });
  });
});
