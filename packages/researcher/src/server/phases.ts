import type {
  ResearchJobStatus,
  SnapshotSourceKind,
  ResearchInvocationMode,
} from '../contract/types';
import type { IResearchJob } from '../db';
import { ResearchJobType } from '../contract/types';
import { buildFallbackDraft } from './report';
import { citationMarker } from './citations';

export type PhaseOutcomeStatus = 'success' | 'interrupted' | 'error' | 'requires_action';

export type PhaseOutcome = {
  status: PhaseOutcomeStatus;
  /** The settling generation's persisted response; the parent for the next phase. */
  responseMessageId?: string;
  responseText?: string;
  error?: string;
};

export type SettleDecision =
  | { kind: 'ignore' }
  | {
      kind: 'advance';
      from: ResearchJobStatus;
      to: 'researching' | 'drafting';
      patch: Partial<IResearchJob>;
    }
  | { kind: 'verify'; from: ResearchJobStatus; patch: Partial<IResearchJob> }
  | { kind: 'fail'; from: ResearchJobStatus; reason: string };

const MAX_BRIEF_CHARS = 4000;

const SOURCE_KINDS: Record<ResearchJobType, SnapshotSourceKind[]> = {
  [ResearchJobType.REQUIREMENTS]: ['document', 'upload', 'web'],
  [ResearchJobType.CURRENT_EVENTS]: ['web', 'rss'],
  [ResearchJobType.TRENDS]: ['web', 'rss', 'priorReport'],
  [ResearchJobType.DIGEST]: ['rss', 'web'],
  [ResearchJobType.SOLUTION]: ['web', 'document', 'upload'],
};

const DELEGATED_KINDS: SnapshotSourceKind[] = ['web', 'rss', 'priorReport'];

/**
 * Delegated (scheduled) runs never reach uploads, and reach internal documents only once
 * the host installs a gateway token provider for unattended runs (design 5.7, 5.9).
 */
export function allowedSourceKinds(
  jobType: ResearchJobType,
  mode: ResearchInvocationMode,
  options: { delegatedDocuments?: boolean } = {},
): SnapshotSourceKind[] {
  const kinds = SOURCE_KINDS[jobType];
  if (mode !== 'delegated') {
    return kinds;
  }
  const delegated: SnapshotSourceKind[] = options.delegatedDocuments
    ? [...DELEGATED_KINDS, 'document']
    : DELEGATED_KINDS;
  return kinds.filter((kind) => delegated.includes(kind));
}

function resolveBrief(job: IResearchJob, outcome: PhaseOutcome): string {
  const fromText = outcome.responseText?.trim();
  return (job.brief?.trim() || fromText || job.prompt).slice(0, MAX_BRIEF_CHARS);
}

function fallbackVerify(job: IResearchJob, outcome: PhaseOutcome): SettleDecision {
  return {
    kind: 'verify',
    from: job.status,
    patch: {
      draft: job.draft?.trim() || buildFallbackDraft(job.notes ?? []),
      partial: true,
      ...(outcome.responseMessageId ? { parentMessageId: outcome.responseMessageId } : {}),
    },
  };
}

/**
 * Pure transition table for a settling phase generation. The service applies the
 * decision with a compare-and-set on the job's status, so a late or duplicate
 * settlement cannot move a job twice.
 */
export function decideOnSettle(job: IResearchJob, outcome: PhaseOutcome): SettleDecision {
  if (outcome.status === 'requires_action') {
    return { kind: 'ignore' };
  }
  const budgetGone = job.budgetExhaustedAt != null;

  switch (job.status) {
    case 'briefing': {
      if (outcome.status === 'error') {
        return { kind: 'fail', from: 'briefing', reason: 'brief_failed' };
      }
      if (!outcome.responseMessageId) {
        return fallbackVerify(job, outcome);
      }
      const brief = resolveBrief(job, outcome);
      return budgetGone
        ? {
            kind: 'advance',
            from: 'briefing',
            to: 'drafting',
            patch: { brief, parentMessageId: outcome.responseMessageId, partial: true },
          }
        : {
            kind: 'advance',
            from: 'briefing',
            to: 'researching',
            patch: { brief, parentMessageId: outcome.responseMessageId },
          };
    }
    case 'researching': {
      if (!outcome.responseMessageId) {
        return fallbackVerify(job, outcome);
      }
      const partial = outcome.status !== 'success' || budgetGone;
      return {
        kind: 'advance',
        from: 'researching',
        to: 'drafting',
        patch: {
          parentMessageId: outcome.responseMessageId,
          ...(partial ? { partial: true } : {}),
        },
      };
    }
    case 'drafting': {
      const draft = job.draft?.trim() || outcome.responseText?.trim();
      if (outcome.status === 'error' || !draft) {
        return fallbackVerify(job, outcome);
      }
      return {
        kind: 'verify',
        from: 'drafting',
        patch: {
          draft,
          ...(outcome.responseMessageId ? { parentMessageId: outcome.responseMessageId } : {}),
          ...(outcome.status === 'interrupted' ? { partial: true } : {}),
        },
      };
    }
    default:
      return { kind: 'ignore' };
  }
}

export type DirectiveContext = {
  remainingSteps: number;
  remainingMinutes: number;
  inputSnapshots: Array<{ id: string; title?: string; sourceKind: SnapshotSourceKind }>;
  /** Upper bound on notes listed for drafting; defaults to all. */
  maxNotes?: number;
  /** The host installed a gateway token provider, so delegated runs may read documents. */
  delegatedDocuments?: boolean;
};

function listSnapshots(snapshots: DirectiveContext['inputSnapshots']): string[] {
  if (snapshots.length === 0) {
    return ['Input snapshots: none.'];
  }
  return [
    'Input snapshots (already fetched, cite by id):',
    ...snapshots.map((s) => `- ${s.id} (${s.sourceKind})${s.title ? `: ${s.title}` : ''}`),
  ];
}

/**
 * Host-rendered input for a `continue` phase generation. The agent's instructions
 * describe the protocol; this message says which phase to run and carries the state
 * persisted between phases.
 */
export function renderPhaseDirective(
  job: IResearchJob,
  phase: 'researching' | 'drafting',
  context: DirectiveContext,
): string {
  const kinds = allowedSourceKinds(job.jobType, job.invocationMode, {
    delegatedDocuments: context.delegatedDocuments,
  }).join(', ');
  const budget = `Budget remaining: about ${context.remainingSteps} tool steps and ${context.remainingMinutes} minutes.`;
  const brief = ['Brief:', job.brief?.trim() || job.prompt];

  if (phase === 'researching') {
    return [
      '[Research phase]',
      ...brief,
      '',
      `Allowed source kinds: ${kinds}.`,
      budget,
      ...listSnapshots(context.inputSnapshots),
      '',
      'Plan narrow sub-questions and delegate each one to a subagent, passing it this brief, its single sub-question and the allowed source kinds.',
      'Every finding must be saved with record_finding (claim, snapshot_id, locator). Findings that are not recorded cannot be cited.',
      'Use only snapshot ids returned by the research tools. Do not write the report in this phase. Stop when the tools report the budget is exhausted.',
    ].join('\n');
  }

  const notes = (job.notes ?? []).slice(0, context.maxNotes ?? Number.MAX_SAFE_INTEGER);
  const required: string[] = [];
  if (job.jobType === ResearchJobType.TRENDS) {
    const priors = context.inputSnapshots.filter((s) => s.sourceKind === 'priorReport');
    required.push(
      priors.length > 0
        ? `Include the section "What changed since the last report", comparing against the prior report snapshots: ${priors.map((s) => s.id).join(', ')}.`
        : 'Include the section "What changed since the last report" and say this is the first report.',
    );
  }
  if (job.jobType === ResearchJobType.DIGEST) {
    if (job.feedsSince) {
      required.push(
        `This digest covers feed items published since ${new Date(job.feedsSince).toISOString()}.`,
      );
    }
    required.push(
      'Include the section "Left out" with one bullet per item you dropped and one line on why.',
    );
  }
  return [
    '[Drafting phase]',
    ...brief,
    '',
    budget,
    ...listSnapshots(context.inputSnapshots),
    '',
    notes.length > 0
      ? 'Recorded findings (claim, then its citation marker):'
      : 'Recorded findings: none.',
    ...notes.map((note) => `- ${note.claim} ${citationMarker(note.snapshotId, note.locator)}`),
    '',
    ...required,
    'Write the report in markdown following your report template. Every sentence that asserts a fact must end with the citation marker of the finding or input snapshot it relies on, for example [[cite:<snapshot_id>]] or [[cite:<snapshot_id>#<locator>]].',
    'Do not state anything you cannot cite from the findings or input snapshots. When done, call submit_draft with the full report.',
  ].join('\n');
}
