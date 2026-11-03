import { researchSchema } from '../../src/contract/research';
import type { ResearchAppConfig } from '../../src/server/config';
import { getResearchStartupConfig, isProtectedResearchAgent } from '../../src/server/startup';
import { ResearchJobType, RESEARCH_AGENT_IDS } from '../../src/contract/types';

describe('getResearchStartupConfig', () => {
  it('tells the client research is on only when the operator enabled it', () => {
    expect(getResearchStartupConfig(undefined)).toBeUndefined();
    expect(
      getResearchStartupConfig({ researcher: researchSchema.parse({}) } as ResearchAppConfig),
    ).toBeUndefined();
    expect(
      getResearchStartupConfig({
        researcher: researchSchema.parse({ enabled: true }),
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
      JSON.stringify(getResearchStartupConfig({ researcher: config } as ResearchAppConfig)),
    ).toBe('{"enabled":true}');
  });
});

describe('isProtectedResearchAgent', () => {
  const researcher = researchSchema.parse({ enabled: true });
  const digest = RESEARCH_AGENT_IDS[ResearchJobType.DIGEST];

  it('protects the five seeded agents while research is enabled', () => {
    expect(isProtectedResearchAgent({ researcher } as ResearchAppConfig, digest)).toBe(true);
    for (const id of Object.values(RESEARCH_AGENT_IDS)) {
      expect(isProtectedResearchAgent({ researcher } as ResearchAppConfig, id)).toBe(true);
    }
  });

  it('protects nothing else', () => {
    expect(isProtectedResearchAgent({ researcher } as ResearchAppConfig, 'agent_other')).toBe(
      false,
    );
    expect(isProtectedResearchAgent({ researcher } as ResearchAppConfig, undefined)).toBe(false);
  });

  it('lets admins delete them once research is turned off', () => {
    const off = researchSchema.parse({});
    expect(isProtectedResearchAgent({ researcher: off } as ResearchAppConfig, digest)).toBe(false);
    expect(isProtectedResearchAgent(undefined, digest)).toBe(false);
  });
});
