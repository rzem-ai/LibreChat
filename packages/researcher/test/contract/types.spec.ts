import { researchSchema } from '../../src/contract/research';
import {
  ResearchJobType,
  RESEARCH_AGENT_IDS,
  isSchedulableAgent,
  researchBriefSubject,
  researchJobTypeForAgent,
} from '../../src/contract/types';

describe('researchBriefSubject', () => {
  const brief = [
    '## Question',
    '',
    "What are today's notable developments in AI security?",
    '',
    '## Sources',
    '- RSS feed items',
  ].join('\n');

  it('takes the question from a brief, not its heading', () => {
    expect(researchBriefSubject(brief, 'Give me a digest')).toBe(
      "What are today's notable developments in AI security?",
    );
  });

  it('falls back to the first prose line of a brief without a Question section', () => {
    expect(researchBriefSubject('# Brief\n\nTrack passkey adoption.', 'prompt')).toBe(
      'Track passkey adoption.',
    );
  });

  it('falls back to the prompt when there is no brief yet', () => {
    expect(researchBriefSubject(undefined, '\nWhat changed in agent security this week?\n')).toBe(
      'What changed in agent security this week?',
    );
  });
});

describe('isSchedulableAgent', () => {
  it('refuses only the research agents that need a live user', () => {
    expect(isSchedulableAgent(RESEARCH_AGENT_IDS[ResearchJobType.REQUIREMENTS])).toBe(false);
    expect(isSchedulableAgent(RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION])).toBe(false);
    expect(isSchedulableAgent(RESEARCH_AGENT_IDS[ResearchJobType.DIGEST])).toBe(true);
    expect(isSchedulableAgent('agent_other')).toBe(true);
  });
});

describe('researchJobTypeForAgent', () => {
  it('maps the five fixed agent ids and nothing else', () => {
    expect(researchJobTypeForAgent(RESEARCH_AGENT_IDS[ResearchJobType.TRENDS])).toBe(
      ResearchJobType.TRENDS,
    );
    expect(researchJobTypeForAgent('agent_other')).toBeUndefined();
    expect(researchJobTypeForAgent(undefined)).toBeUndefined();
  });
});

describe('ResearchJobType', () => {
  it('names exactly the jobs the research config budgets', () => {
    const jobs = researchSchema.parse({}).jobs;
    expect(Object.values(ResearchJobType).sort()).toEqual(Object.keys(jobs).sort());
  });
});
