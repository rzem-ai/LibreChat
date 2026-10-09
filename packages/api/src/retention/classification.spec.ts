import type { IAclEntry } from '@librechat/data-schemas';
import {
  classifyAgentPurgeEligibility,
  classifySkillPurgeEligibility,
  type AgentRetentionCandidate,
  type SkillRetentionCandidate,
} from './classification';

function fakeEntry(resourceId: string): IAclEntry {
  return { resourceId } as unknown as IAclEntry;
}

function agentCandidate(overrides: Partial<AgentRetentionCandidate> = {}): AgentRetentionCandidate {
  return {
    resourceId: 'agent-1',
    author: 'author-1',
    isPromoted: false,
    legacyId: 'agent-1',
    ...overrides,
  };
}

function skillCandidate(overrides: Partial<SkillRetentionCandidate> = {}): SkillRetentionCandidate {
  return {
    resourceId: 'skill-1',
    author: 'author-1',
    source: 'inline',
    ...overrides,
  };
}

describe('classifyAgentPurgeEligibility', () => {
  it('excludes promoted (catalog) agents outright', async () => {
    const candidate = agentCandidate({ isPromoted: true });
    const eligible = await classifyAgentPurgeEligibility([candidate], {
      findEntriesByResources: async () => [],
      getGlobalAgentIds: async () => new Set(),
    });
    expect(eligible.has('agent-1')).toBe(false);
  });

  it('excludes a zero-ACL-entry legacy agent present on the admin-maintained global list', async () => {
    const candidate = agentCandidate();
    const eligible = await classifyAgentPurgeEligibility([candidate], {
      findEntriesByResources: async () => [],
      getGlobalAgentIds: async () => new Set(['agent-1']),
    });
    expect(eligible.has('agent-1')).toBe(false);
  });

  it('includes a zero-ACL-entry legacy agent absent from the global list', async () => {
    const candidate = agentCandidate();
    const eligible = await classifyAgentPurgeEligibility([candidate], {
      findEntriesByResources: async () => [],
      getGlobalAgentIds: async () => new Set(),
    });
    expect(eligible.has('agent-1')).toBe(true);
  });

  it('regression: a private agent shared via ACL with another user is still purge-eligible', async () => {
    const candidate = agentCandidate();
    const eligible = await classifyAgentPurgeEligibility([candidate], {
      findEntriesByResources: async (resourceType) =>
        resourceType === 'agent' ? [fakeEntry('agent-1')] : [],
      getGlobalAgentIds: async () => new Set(),
    });
    expect(eligible.has('agent-1')).toBe(true);
  });

  it('returns an empty set without querying deps when every candidate is promoted', async () => {
    const findEntriesByResources = jest.fn();
    const getGlobalAgentIds = jest.fn();
    const eligible = await classifyAgentPurgeEligibility([agentCandidate({ isPromoted: true })], {
      findEntriesByResources,
      getGlobalAgentIds,
    });
    expect(eligible.size).toBe(0);
    expect(findEntriesByResources).not.toHaveBeenCalled();
    expect(getGlobalAgentIds).not.toHaveBeenCalled();
  });
});

describe('classifySkillPurgeEligibility', () => {
  it('excludes non-inline (synced) skills', async () => {
    const eligible = await classifySkillPurgeEligibility([skillCandidate({ source: 'github' })]);
    expect(eligible.has('skill-1')).toBe(false);
  });

  it('regression: an inline skill is purge-eligible regardless of ACL/sharing state, since no ACL lookup is performed', async () => {
    const eligible = await classifySkillPurgeEligibility([skillCandidate()]);
    expect(eligible.has('skill-1')).toBe(true);
  });
});
