import { researchSchema } from '../../src/contract/research';
import type { ResearchAppConfig } from '../../src/server/config';
import { getResearchStartupConfig, isProtectedResearchAgent } from '../../src/server/startup';
import { ResearchJobType, RESEARCH_AGENT_IDS } from '../../src/contract/types';

describe('getResearchStartupConfig', () => {
  it('tells the client research is on only when the operator enabled it', () => {
    expect(getResearchStartupConfig(undefined)).toBeUndefined();
    expect(
      getResearchStartupConfig({ research: researchSchema.parse({}) } as ResearchAppConfig),
    ).toBeUndefined();
    expect(
      getResearchStartupConfig({
        research: researchSchema.parse({ enabled: true }),
      } as ResearchAppConfig),
    ).toEqual({ enabled: true });
  });

  it('exposes no server-side levers such as keys or models', () => {
    const config = researchSchema.parse({
      enabled: true,
      search: { braveApiKey: 'secret' },
      agents: { provider: 'p', model: 'm' },
    });
    expect(
      JSON.stringify(getResearchStartupConfig({ research: config } as ResearchAppConfig)),
    ).toBe('{"enabled":true}');
  });
});

describe('isProtectedResearchAgent', () => {
  const research = researchSchema.parse({ enabled: true });
  const digest = RESEARCH_AGENT_IDS[ResearchJobType.DIGEST];

  it('protects the five seeded agents while research is enabled', () => {
    expect(isProtectedResearchAgent({ research } as ResearchAppConfig, digest)).toBe(true);
    for (const id of Object.values(RESEARCH_AGENT_IDS)) {
      expect(isProtectedResearchAgent({ research } as ResearchAppConfig, id)).toBe(true);
    }
  });

  it('protects nothing else', () => {
    expect(isProtectedResearchAgent({ research } as ResearchAppConfig, 'agent_other')).toBe(false);
    expect(isProtectedResearchAgent({ research } as ResearchAppConfig, undefined)).toBe(false);
  });

  it('lets admins delete them once research is turned off', () => {
    const off = researchSchema.parse({});
    expect(isProtectedResearchAgent({ research: off } as ResearchAppConfig, digest)).toBe(false);
    expect(isProtectedResearchAgent(undefined, digest)).toBe(false);
  });
});
