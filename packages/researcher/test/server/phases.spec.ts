import type { IResearchJob } from '../../src/db';
import { decideOnSettle, allowedSourceKinds, renderPhaseDirective } from '../../src/server/phases';
import { ResearchJobType } from '../../src/contract/types';

const job = (overrides: Partial<IResearchJob> = {}): IResearchJob =>
  ({
    id: 'j1',
    user: 'u1' as unknown as IResearchJob['user'],
    agentId: 'agent_research_current_events',
    jobType: ResearchJobType.CURRENT_EVENTS,
    invocationMode: 'interactive',
    status: 'briefing',
    partial: false,
    prompt: 'What is happening with widgets?',
    budget: { wallClockMinutes: 30, maxSteps: 300 },
    budgetUsed: { elapsedMs: 0, steps: 0 },
    conversationId: 'c1',
    inputSnapshotIds: [],
    citedSnapshotIds: [],
    deliveries: [],
    ...overrides,
  }) as IResearchJob;

describe('decideOnSettle', () => {
  it('moves a finished brief to research, keeping the saved brief', () => {
    const decision = decideOnSettle(job({ brief: 'Saved brief' }), {
      status: 'success',
      responseMessageId: 'm1',
      responseText: 'ignored',
    });
    expect(decision).toEqual({
      kind: 'advance',
      from: 'briefing',
      to: 'researching',
      patch: { brief: 'Saved brief', parentMessageId: 'm1' },
    });
  });

  it('falls back to the response text, then the prompt, for a missing brief', () => {
    const fromText = decideOnSettle(job(), {
      status: 'success',
      responseMessageId: 'm1',
      responseText: '  Brief from text  ',
    });
    expect(fromText.kind === 'advance' && fromText.patch.brief).toBe('Brief from text');
    const fromPrompt = decideOnSettle(job(), { status: 'success', responseMessageId: 'm1' });
    expect(fromPrompt.kind === 'advance' && fromPrompt.patch.brief).toBe(
      'What is happening with widgets?',
    );
  });

  it('skips research when the budget is already exhausted', () => {
    const decision = decideOnSettle(job({ brief: 'b', budgetExhaustedAt: new Date() }), {
      status: 'success',
      responseMessageId: 'm1',
    });
    expect(decision).toMatchObject({ kind: 'advance', to: 'drafting', patch: { partial: true } });
  });

  it('fails a job whose brief generation errored', () => {
    expect(decideOnSettle(job(), { status: 'error', error: 'boom' })).toEqual({
      kind: 'fail',
      from: 'briefing',
      reason: 'brief_failed',
    });
  });

  it('drafts after research and marks an interrupted research run partial', () => {
    const decision = decideOnSettle(job({ status: 'researching' }), {
      status: 'interrupted',
      responseMessageId: 'm2',
    });
    expect(decision).toEqual({
      kind: 'advance',
      from: 'researching',
      to: 'drafting',
      patch: { parentMessageId: 'm2', partial: true },
    });
  });

  it('verifies the saved draft once drafting finishes', () => {
    const decision = decideOnSettle(job({ status: 'drafting', draft: 'The draft' }), {
      status: 'success',
      responseMessageId: 'm3',
    });
    expect(decision).toEqual({
      kind: 'verify',
      from: 'drafting',
      patch: { draft: 'The draft', parentMessageId: 'm3' },
    });
  });

  it('builds a fallback draft from notes when drafting fails', () => {
    const decision = decideOnSettle(
      job({ status: 'drafting', notes: [{ claim: 'X', snapshotId: 's1' }] }),
      { status: 'error' },
    );
    expect(decision.kind).toBe('verify');
    if (decision.kind === 'verify') {
      expect(decision.patch.partial).toBe(true);
      expect(decision.patch.draft).toContain('[[cite:s1]]');
    }
  });

  it('verifies a fallback when a phase ends without a response to continue from', () => {
    const decision = decideOnSettle(job({ status: 'researching' }), { status: 'success' });
    expect(decision).toMatchObject({ kind: 'verify', patch: { partial: true } });
  });

  it('waits while a phase is paused for approval', () => {
    expect(decideOnSettle(job(), { status: 'requires_action' })).toEqual({ kind: 'ignore' });
  });
});

describe('allowedSourceKinds', () => {
  it('limits delegated runs to web, feeds and prior reports', () => {
    expect(allowedSourceKinds(ResearchJobType.SOLUTION, 'interactive')).toEqual(
      expect.arrayContaining(['web', 'document', 'upload']),
    );
    expect(allowedSourceKinds(ResearchJobType.TRENDS, 'delegated')).toEqual([
      'web',
      'rss',
      'priorReport',
    ]);
    expect(allowedSourceKinds(ResearchJobType.REQUIREMENTS, 'delegated')).not.toContain('document');
  });

  it('lets delegated runs read named documents once a gateway token provider is installed', () => {
    const kinds = allowedSourceKinds(ResearchJobType.REQUIREMENTS, 'delegated', {
      delegatedDocuments: true,
    });
    expect(kinds).toContain('document');
    expect(kinds).not.toContain('upload');
    expect(
      allowedSourceKinds(ResearchJobType.DIGEST, 'delegated', { delegatedDocuments: true }),
    ).not.toContain('document');
  });
});

describe('renderPhaseDirective', () => {
  it('gives the research phase its brief, budget and input snapshots', () => {
    const text = renderPhaseDirective(job({ brief: 'Widgets brief' }), 'researching', {
      remainingSteps: 120,
      remainingMinutes: 12,
      inputSnapshots: [{ id: 'doc_1', title: 'Spec', sourceKind: 'document' }],
    });
    expect(text).toContain('[Research phase]');
    expect(text).toContain('Widgets brief');
    expect(text).toContain('120');
    expect(text).toContain('doc_1');
    expect(text).toContain('record_finding');
  });

  it('gives the drafting phase every note with its citation marker', () => {
    const text = renderPhaseDirective(
      job({ brief: 'b', notes: [{ claim: 'X grew', snapshotId: 's1', locator: 'p2' }] }),
      'drafting',
      { remainingSteps: 10, remainingMinutes: 3, inputSnapshots: [] },
    );
    expect(text).toContain('[Drafting phase]');
    expect(text).toContain('X grew');
    expect(text).toContain('[[cite:s1#p2]]');
    expect(text).toContain('submit_draft');
  });

  it('tells a digest draft its feed window and the section it must include', () => {
    const text = renderPhaseDirective(
      job({ jobType: ResearchJobType.DIGEST, feedsSince: new Date('2026-11-02T06:00:00.000Z') }),
      'drafting',
      { remainingSteps: 10, remainingMinutes: 3, inputSnapshots: [] },
    );
    expect(text).toContain('2026-11-02T06:00:00.000Z');
    expect(text).toContain('Left out');
  });

  it('tells a trends draft to compare against its prior reports', () => {
    const text = renderPhaseDirective(job({ jobType: ResearchJobType.TRENDS }), 'drafting', {
      remainingSteps: 10,
      remainingMinutes: 3,
      inputSnapshots: [{ id: 'report_1', title: 'Last week', sourceKind: 'priorReport' }],
    });
    expect(text).toContain('What changed since the last report');
    expect(text).toContain('report_1');
  });
});
