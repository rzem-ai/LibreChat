import { handleSkillRenewRequest, handleSkillsExpiringSoonRequest } from './renewal';

describe('handleSkillRenewRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };

  const createDeps = (skill: Record<string, unknown> | null = { name: 'skill-1' }) => ({
    renewSkillActivity: jest.fn().mockResolvedValue(skill),
    retentionHours: 2160,
  });

  it('rejects unauthenticated requests without touching the DB', async () => {
    const deps = createDeps();
    const result = await handleSkillRenewRequest({}, { skill_id: 'skill-1' }, deps);
    expect(result).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
    expect(deps.renewSkillActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['not a string', { skill_id: 42 }],
    ['empty string', { skill_id: '' }],
  ])('rejects %s skill_id with 400', async (_label, body) => {
    const deps = createDeps();
    const result = await handleSkillRenewRequest(user, body, deps);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ code: 'INVALID_SKILL_ID' });
    expect(deps.renewSkillActivity).not.toHaveBeenCalled();
  });

  it('renews as an owner-scoped activity re-stamp', async () => {
    const deps = createDeps({ name: 'skill-1', expiredAt: new Date() });
    const result = await handleSkillRenewRequest(user, { skill_id: 'skill-1' }, deps);
    expect(deps.renewSkillActivity).toHaveBeenCalledWith('skill-1', 'user-1', 2160);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ skill: { name: 'skill-1', expiredAt: expect.any(Date) } });
  });

  it('returns 404 when the skill does not resolve under the owner scope', async () => {
    const deps = createDeps(null);
    const result = await handleSkillRenewRequest(user, { skill_id: 'not-owned' }, deps);
    expect(result).toEqual({ status: 404, body: { code: 'SKILL_NOT_FOUND' } });
  });
});

describe('handleSkillsExpiringSoonRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };

  it('rejects unauthenticated requests without touching the DB', async () => {
    const getSkillsExpiringSoon = jest.fn();
    const result = await handleSkillsExpiringSoonRequest(
      {},
      { getSkillsExpiringSoon, retentionWarningHours: 168 },
    );
    expect(result).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
    expect(getSkillsExpiringSoon).not.toHaveBeenCalled();
  });

  it('lists the owner-scoped skills within the configured warning window', async () => {
    const skills = [{ name: 'skill-1' }];
    const getSkillsExpiringSoon = jest.fn().mockResolvedValue(skills);
    const result = await handleSkillsExpiringSoonRequest(user, {
      getSkillsExpiringSoon,
      retentionWarningHours: 168,
    });
    expect(getSkillsExpiringSoon).toHaveBeenCalledWith(
      { userId: 'user-1', tenantId: 'tenant-1' },
      168 * 60 * 60 * 1000,
    );
    expect(result).toEqual({ status: 200, body: { skills } });
  });
});
