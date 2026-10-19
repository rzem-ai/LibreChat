// Deloitte Custom Change: Retention Update
import { handleSetAgentRetentionException, handleSetSkillRetentionException } from './exemption';

describe('handleSetAgentRetentionException', () => {
  it('rejects a missing/empty agent id', async () => {
    const result = await handleSetAgentRetentionException(
      'admin-1',
      '',
      { exempt: true },
      {
        setAgentRetentionException: jest.fn(),
      },
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_AGENT_ID');
  });

  it('rejects a non-boolean exempt field', async () => {
    const result = await handleSetAgentRetentionException(
      'admin-1',
      'agent-1',
      { exempt: 'yes' },
      { setAgentRetentionException: jest.fn() },
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_EXEMPT');
  });

  it('rejects an empty or over-length reason', async () => {
    const tooLong = 'a'.repeat(501);
    const result = await handleSetAgentRetentionException(
      'admin-1',
      'agent-1',
      { exempt: true, reason: tooLong },
      { setAgentRetentionException: jest.fn() },
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_REASON');
  });

  it('returns 404 when the agent does not exist', async () => {
    const result = await handleSetAgentRetentionException(
      'admin-1',
      'agent-404',
      { exempt: true },
      { setAgentRetentionException: async () => null },
    );
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('AGENT_NOT_FOUND');
  });

  it('sets the exemption, stamping setBy from the caller and setAt to now', async () => {
    const setAgentRetentionException = jest.fn().mockResolvedValue({
      id: 'agent-1',
      retentionException: {
        exempt: true,
        reason: 'catalog pilot',
        setBy: 'admin-1',
        setAt: new Date(),
      },
    });
    const result = await handleSetAgentRetentionException(
      'admin-1',
      'agent-1',
      { exempt: true, reason: 'catalog pilot' },
      { setAgentRetentionException },
    );
    expect(result.status).toBe(200);
    expect(setAgentRetentionException).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({ exempt: true, reason: 'catalog pilot', setBy: 'admin-1' }),
    );
  });
});

describe('handleSetSkillRetentionException', () => {
  it('rejects a missing/empty skill id', async () => {
    const result = await handleSetSkillRetentionException(
      'admin-1',
      '',
      { exempt: true },
      {
        setSkillRetentionException: jest.fn(),
      },
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_SKILL_ID');
  });

  it('returns 404 when the skill does not exist', async () => {
    const result = await handleSetSkillRetentionException(
      'admin-1',
      'skill-404',
      { exempt: false },
      { setSkillRetentionException: async () => null },
    );
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('SKILL_NOT_FOUND');
  });

  it('clears an exemption by setting exempt: false without a reason', async () => {
    const setSkillRetentionException = jest.fn().mockResolvedValue({
      retentionException: { exempt: false, setBy: 'admin-1', setAt: new Date() },
    });
    const result = await handleSetSkillRetentionException(
      'admin-1',
      'skill-1',
      { exempt: false },
      { setSkillRetentionException },
    );
    expect(result.status).toBe(200);
    expect(setSkillRetentionException).toHaveBeenCalledWith(
      'skill-1',
      expect.objectContaining({ exempt: false, setBy: 'admin-1' }),
    );
  });
});
