import { randomUUID } from 'node:crypto';
import { createAgentTriggerEnvelope, getAgentTriggerIdempotencyKey } from '@librechat/api';
import { logger as defaultLogger, runAsSystem, tenantStorage } from '@librechat/data-schemas';
import type { AgentTriggerEnvelope } from '@librechat/api';
import type {
  CancelResearchJobResult,
  FeedMethods,
  IResearchJob,
  IVerificationSummary,
  ResearchMethods,
} from '../db';
import type { TResearchConfig } from '../contract/research';
import type { DeliveryChannel, ChannelSendResult } from './channels';
import type { ResearchInvocationMode } from '../contract/types';
import type { ClaimVerifier, SnapshotReader } from './verify';
import type { PhaseOutcome, SettleDecision } from './phases';
import {
  ResearchJobType,
  researchBriefSubject,
  researchJobTypeForAgent,
  SCHEDULABLE_RESEARCH_JOB_TYPES,
} from '../contract/types';
import { buildReport, sanitiseDraft, buildFallbackDraft, ensureRequiredSections } from './report';
import { extractDocumentReferences, extractPromptUrls, urlHash } from './references';
import { getJobBudget, computeDeadlines, remainingSteps } from './budget';
import { decideOnSettle, renderPhaseDirective } from './phases';
import { deliveryRetryAt } from './channels';
import { verifyDraft } from './verify';

export const RESEARCH_EVENT_TYPE = 'research.phase';
export const RESEARCH_SOURCE_TYPE = 'research';

const VERIFY_LEASE_MS = 10 * 60_000;
const WATCHDOG_BATCH = 50;
const VERIFY_BATCH = 4;
const MAX_DIRECTIVE_SNAPSHOTS = 100;

export type ResearchPrincipal = { id: string; tenantId?: string; role?: string };

export type ResearchErrorCode =
  | 'research_disabled'
  | 'research_job_running'
  | 'research_concurrency_limit'
  | 'research_job_not_schedulable';

export type AdmissionResult =
  | null
  | { ok: true; job: IResearchJob }
  | { ok: false; error: { code: ResearchErrorCode } };

export type DeliverReportInput = {
  job: IResearchJob;
  title: string;
  filename: string;
  markdown: string;
  summary: IVerificationSummary;
  /** Persisted message the delivery message is attached below. */
  parentMessageId?: string;
};

export type ResearchServiceMethods = Pick<
  ResearchMethods,
  | 'createResearchJob'
  | 'getResearchJobById'
  | 'getResearchJobsByUser'
  | 'getLiveResearchJobByConversation'
  | 'countActiveResearchJobs'
  | 'transitionResearchJob'
  | 'updateResearchJob'
  | 'cancelResearchJob'
  | 'setResearchDelivery'
  | 'claimResearchJob'
  | 'releaseResearchJobLease'
  | 'findResearchJobsPastDraftThreshold'
  | 'findResearchJobsPastDeadline'
  | 'getSnapshotsByIds'
  | 'archiveSnapshots'
  | 'getDeliveredResearchJobsForSchedule'
  | 'getLastDeliveredResearchJobForSchedule'
  | 'getResearchSchedule'
  | 'queueResearchDeliveries'
  | 'claimResearchDeliveries'
  | 'recordResearchDeliveryAttempt'
  | 'releaseResearchDeliveryLease'
> &
  Pick<FeedMethods, 'archiveFeedItemsBySnapshot'>;

export interface ResearchServiceDeps {
  methods: ResearchServiceMethods;
  /** Resolves the effective research config for a principal (tenant and role overrides). */
  getConfig: (principal: ResearchPrincipal) => Promise<TResearchConfig | undefined>;
  enqueueTrigger: (
    envelope: AgentTriggerEnvelope,
    options?: { orderingKey?: string },
  ) => Promise<unknown>;
  /**
   * Stops the generation running in a conversation. Optional: without it, stops are
   * cooperative (research tools refuse once a job is flagged, cancelled or past its
   * deadline, and the late settlement no longer matches the job's phase key).
   */
  abortGeneration?: (conversationId: string) => Promise<void>;
  /** A verifier, or a factory resolving one for the job owner (tenant and role config). */
  verifier: ClaimVerifier | ((owner: ResearchPrincipal) => Promise<ClaimVerifier>);
  reader: SnapshotReader;
  /** Saves the report and attaches it to a message in the job's conversation. */
  deliverReport: (input: DeliverReportInput) => Promise<{ fileId: string }>;
  /**
   * Keeps a scheduled trends report as a user-owned `priorReport` snapshot, which the
   * next run of the schedule loads as a source. Optional: without it, trends runs start
   * without prior reports.
   */
  recordReportSnapshot?: (input: {
    job: IResearchJob;
    title: string;
    markdown: string;
  }) => Promise<{ snapshotId: string }>;
  /** Channels beyond the conversation, sent when a schedule asks for them (design 5.8). */
  channels?: DeliveryChannel[];
  /**
   * The host installed a gateway token provider for unattended runs (design 5.9), so jobs
   * that read internal documents may be scheduled and read them in detached phases.
   */
  delegatedDocuments?: boolean;
  instanceId: string;
  now?: () => Date;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
}

export type SettlePhaseInput = PhaseOutcome & {
  principal: ResearchPrincipal;
  conversationId: string;
  /** The settling request's `clientRequestId`; must equal the job's phase key. */
  clientRequestId: string;
};

/** The key a non-trigger (interactive) brief request settles under. */
export function researchPhaseKey(clientRequestId: unknown, conversationId: string): string {
  return typeof clientRequestId === 'string' && clientRequestId.length > 0
    ? clientRequestId
    : `interactive:${conversationId}`;
}

const JOB_TITLES: Record<ResearchJobType, string> = {
  [ResearchJobType.REQUIREMENTS]: 'Requirements research',
  [ResearchJobType.CURRENT_EVENTS]: 'Current events research',
  [ResearchJobType.TRENDS]: 'Trend research',
  [ResearchJobType.DIGEST]: 'Daily digest',
  [ResearchJobType.SOLUTION]: 'Solution research',
};

/** The job type's display name, as used in report titles and email subjects. */
export function researchJobTitle(jobType: ResearchJobType): string {
  return JOB_TITLES[jobType];
}

function reportTitle(job: IResearchJob): string {
  const subject = researchBriefSubject(job.brief, job.prompt);
  const short = subject.length > 80 ? `${subject.slice(0, 77)}...` : subject;
  return short ? `${JOB_TITLES[job.jobType]}: ${short}` : JOB_TITLES[job.jobType];
}

function reportFilename(job: IResearchJob, at: Date): string {
  return `${job.jobType}-report-${at.toISOString().slice(0, 10)}.md`;
}

function principalOf(job: IResearchJob): ResearchPrincipal {
  return { id: String(job.user), ...(job.tenantId ? { tenantId: job.tenantId } : {}) };
}

function inTenant<T>(job: IResearchJob, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId: job.tenantId, userId: String(job.user) }, fn);
}

export type ResearchService = {
  admitSubmission: (input: {
    principal: ResearchPrincipal;
    agentId: string;
    conversationId: string;
    prompt: string;
    phaseKey: string;
    invocationMode?: ResearchInvocationMode;
    scheduleId?: string;
    inputSnapshotIds?: string[];
    uploadFileIds?: string[];
  }) => Promise<AdmissionResult>;
  settlePhase: (input: SettlePhaseInput) => Promise<void>;
  cancel: (jobId: string, userId: string) => Promise<CancelResearchJobResult>;
  tick: () => Promise<void>;
  listJobs: (userId: string) => Promise<IResearchJob[]>;
  getJob: (jobId: string, userId: string) => Promise<IResearchJob | null>;
};

export function createResearchService(deps: ResearchServiceDeps): ResearchService {
  const { methods } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;

  async function admitSubmission(input: {
    principal: ResearchPrincipal;
    agentId: string;
    conversationId: string;
    prompt: string;
    phaseKey: string;
    invocationMode?: ResearchInvocationMode;
    scheduleId?: string;
    inputSnapshotIds?: string[];
    /** Upload file ids already verified as the user's own. */
    uploadFileIds?: string[];
  }): Promise<AdmissionResult> {
    const jobType = researchJobTypeForAgent(input.agentId);
    if (!jobType) {
      return null;
    }
    const config = await deps.getConfig(input.principal);
    if (!config?.enabled) {
      return { ok: false, error: { code: 'research_disabled' } };
    }
    const invocationMode = input.invocationMode ?? 'interactive';
    if (
      invocationMode === 'delegated' &&
      !deps.delegatedDocuments &&
      !SCHEDULABLE_RESEARCH_JOB_TYPES.includes(jobType)
    ) {
      return { ok: false, error: { code: 'research_job_not_schedulable' } };
    }
    const [running, active] = await Promise.all([
      methods.getLiveResearchJobByConversation(input.conversationId, input.principal.id),
      methods.countActiveResearchJobs(input.principal.id),
    ]);
    if (running) {
      return { ok: false, error: { code: 'research_job_running' } };
    }
    if (active >= config.maxConcurrentJobsPerUser) {
      return { ok: false, error: { code: 'research_concurrency_limit' } };
    }

    const scheduled = invocationMode === 'delegated' && input.scheduleId ? input.scheduleId : null;
    const priorReportIds =
      scheduled && jobType === ResearchJobType.TRENDS && config.jobs.trends.priorReports > 0
        ? (
            await methods.getDeliveredResearchJobsForSchedule(
              input.principal.id,
              scheduled,
              config.jobs.trends.priorReports,
            )
          )
            .map((prior) => prior.reportSnapshotId)
            .filter((id): id is string => typeof id === 'string')
        : [];
    const lastRun =
      scheduled && jobType === ResearchJobType.DIGEST
        ? await methods.getLastDeliveredResearchJobForSchedule(input.principal.id, scheduled)
        : null;

    const startedAt = now();
    const budget = getJobBudget(config, jobType);
    const job = await methods.createResearchJob({
      id: `research_${randomUUID()}`,
      user: input.principal.id as unknown as IResearchJob['user'],
      agentId: input.agentId,
      jobType,
      invocationMode,
      status: 'briefing',
      prompt: input.prompt,
      budget,
      conversationId: input.conversationId,
      phaseDeliveryKey: input.phaseKey,
      inputSnapshotIds: [...new Set([...(input.inputSnapshotIds ?? []), ...priorReportIds])],
      ...(lastRun?.completedAt ? { feedsSince: lastRun.completedAt } : {}),
      uploadFileIds: input.uploadFileIds ?? [],
      documentReferences: extractDocumentReferences(input.prompt),
      knownUrlHashes: extractPromptUrls(input.prompt)
        .map(urlHash)
        .filter((hash): hash is string => hash != null),
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      startedAt,
      phaseStartedAt: startedAt,
      ...computeDeadlines(startedAt, budget, config.budgetDraftThreshold),
    });
    return { ok: true, job };
  }

  async function buildPhaseEnvelope(
    job: IResearchJob,
    phase: 'researching' | 'drafting',
    parentMessageId: string,
    patched: IResearchJob,
    config: TResearchConfig | undefined,
  ): Promise<AgentTriggerEnvelope> {
    const snapshots = await methods.getSnapshotsByIds(
      job.inputSnapshotIds.slice(0, MAX_DIRECTIVE_SNAPSHOTS),
      String(job.user),
    );
    const deadline = job.deadlineAt ? new Date(job.deadlineAt).getTime() : now().getTime();
    const input = renderPhaseDirective(patched, phase, {
      remainingSteps: remainingSteps(job),
      remainingMinutes: Math.max(0, Math.round((deadline - now().getTime()) / 60_000)),
      inputSnapshots: snapshots.map((s) => ({
        id: s.id,
        title: s.title,
        sourceKind: s.sourceKind,
      })),
      maxNotes: config?.verification.maxClaims,
      delegatedDocuments: deps.delegatedDocuments,
    });
    const principal = principalOf(job);
    return createAgentTriggerEnvelope({
      mode: 'continue',
      requestId: randomUUID(),
      deliveryId: `${job.id}:${phase}`,
      receivedAt: now().getTime(),
      principal,
      event: {
        id: `${job.id}:${phase}`,
        type: RESEARCH_EVENT_TYPE,
        occurredAt: now().getTime(),
        source: { id: job.id, type: RESEARCH_SOURCE_TYPE },
      },
      target: { agentId: job.agentId, conversationId: job.conversationId, parentMessageId },
      input,
    });
  }

  async function applyDecision(job: IResearchJob, decision: SettleDecision): Promise<void> {
    if (decision.kind === 'ignore') {
      return;
    }
    if (decision.kind === 'fail') {
      await methods.transitionResearchJob(job.id, decision.from, 'failed', {
        failureReason: decision.reason,
        completedAt: now(),
      });
      return;
    }
    if (decision.kind === 'verify') {
      await methods.transitionResearchJob(job.id, decision.from, 'verifying', decision.patch);
      return;
    }
    const parentMessageId = decision.patch.parentMessageId as string;
    const config = await deps.getConfig(principalOf(job));
    const envelope = await buildPhaseEnvelope(
      job,
      decision.to,
      parentMessageId,
      { ...job, ...decision.patch },
      config,
    );
    const phaseDeliveryKey = getAgentTriggerIdempotencyKey(envelope);
    const moved = await methods.transitionResearchJob(job.id, decision.from, decision.to, {
      ...decision.patch,
      phaseDeliveryKey,
    });
    if (!moved) {
      return;
    }
    try {
      await deps.enqueueTrigger(envelope, { orderingKey: job.id });
    } catch (error) {
      // The deadline watchdog forces delivery of whatever exists if this phase never runs.
      log.error(`[research] Failed to enqueue ${decision.to} phase for job ${job.id}`, error);
    }
  }

  /**
   * Called at every terminal point of a generation in a research conversation. Only the
   * request holding the job's current phase key may advance it.
   */
  async function settlePhase(input: SettlePhaseInput): Promise<void> {
    const job = await methods.getLiveResearchJobByConversation(
      input.conversationId,
      input.principal.id,
    );
    if (!job || job.phaseDeliveryKey !== input.clientRequestId) {
      return;
    }
    await applyDecision(job, decideOnSettle(job, input));
  }

  async function cancel(jobId: string, userId: string): Promise<CancelResearchJobResult> {
    const job = await methods.getResearchJobById(jobId, userId);
    const result = await methods.cancelResearchJob(jobId, userId);
    if (result === 'cancelled' && job) {
      await deps.abortGeneration?.(job.conversationId).catch((error: unknown) => {
        log.warn(`[research] Failed to stop generation for cancelled job ${jobId}`, error);
      });
    }
    return result;
  }

  async function stopAtDraftThreshold(at: Date): Promise<void> {
    const due = await runAsSystem(() =>
      methods.findResearchJobsPastDraftThreshold(at, WATCHDOG_BATCH),
    );
    for (const job of due) {
      await inTenant(job, async () => {
        await methods.updateResearchJob(job.id, { budgetExhaustedAt: at });
        if (job.status === 'researching') {
          await deps.abortGeneration?.(job.conversationId);
        }
      }).catch((error: unknown) =>
        log.warn(`[research] Draft-threshold stop failed for job ${job.id}`, error),
      );
    }
  }

  async function forcePastDeadline(at: Date): Promise<void> {
    const overdue = await runAsSystem(() =>
      methods.findResearchJobsPastDeadline(at, WATCHDOG_BATCH),
    );
    for (const job of overdue) {
      await inTenant(job, async () => {
        const moved = await methods.transitionResearchJob(job.id, job.status, 'verifying', {
          draft: job.draft?.trim() || buildFallbackDraft(job.notes ?? []),
          partial: true,
          budgetExhaustedAt: job.budgetExhaustedAt ?? at,
        });
        if (moved) {
          await deps.abortGeneration?.(job.conversationId);
        }
      }).catch((error: unknown) =>
        log.warn(`[research] Deadline enforcement failed for job ${job.id}`, error),
      );
    }
  }

  async function verifyAndDeliver(job: IResearchJob): Promise<void> {
    const config = await deps.getConfig(principalOf(job));
    const rawDraft = ensureRequiredSections(
      job.jobType,
      job.draft?.trim() || buildFallbackDraft(job.notes ?? []),
    );
    const outcome = await verifyDraft({
      draft: sanitiseDraft(rawDraft),
      brief: job.brief,
      userId: String(job.user),
      maxClaims: config?.verification.maxClaims ?? 400,
      strict: job.jobType === ResearchJobType.SOLUTION,
      getSnapshotsByIds: (ids, userId) => methods.getSnapshotsByIds(ids, userId),
      reader: deps.reader,
      verifier:
        typeof deps.verifier === 'function' ? await deps.verifier(principalOf(job)) : deps.verifier,
    });
    const at = now();
    const title = reportTitle(job);
    const markdown = buildReport({
      title,
      draft: rawDraft,
      sentenceStates: outcome.sentenceStates,
      summary: outcome.summary,
      snapshots: outcome.snapshots,
      partial: job.partial,
      notes: outcome.notes,
    });
    const { fileId } = await deps.deliverReport({
      job,
      title,
      filename: reportFilename(job, at),
      markdown,
      summary: outcome.summary,
      parentMessageId: job.parentMessageId,
    });
    const citedSnapshotIds = outcome.snapshots.map((snapshot) => snapshot.id);
    await methods.archiveSnapshots(citedSnapshotIds);
    await methods.archiveFeedItemsBySnapshot(citedSnapshotIds);
    const delivered = await methods.transitionResearchJob(job.id, 'verifying', 'delivered', {
      reportFileId: fileId,
      verification: outcome.summary,
      citations: outcome.citations,
      citedSnapshotIds,
      completedAt: at,
    });
    if (!delivered) {
      return;
    }
    await methods.setResearchDelivery(job.id, 'conversation', 'sent');
    const channels = await scheduledChannels(delivered, config);
    const snapshotId = await keepReportSnapshot(delivered, title, markdown, channels.length > 0);
    if (snapshotId && channels.length > 0) {
      await methods.queueResearchDeliveries(job.id, channels, at);
    }
  }

  /** Extra channels the job's schedule asks for that this deployment enables. */
  async function scheduledChannels(
    job: IResearchJob,
    config: TResearchConfig | undefined,
  ): Promise<DeliveryChannel['channel'][]> {
    if (!job.scheduleId || !config) {
      return [];
    }
    const schedule = await methods.getResearchSchedule(job.scheduleId, job.user);
    return (schedule?.channels ?? []).filter(
      (channel): channel is DeliveryChannel['channel'] =>
        channel !== 'conversation' && config.delivery[channel] === true,
    );
  }

  /** A scheduled trends report becomes the next run's prior report; failure only logs. */
  /**
   * Keeps the delivered report as an archived snapshot: a scheduled trends run loads it
   * as the next run's prior report, and extra channels send from it. Failure only logs.
   */
  async function keepReportSnapshot(
    job: IResearchJob,
    title: string,
    markdown: string,
    forChannels: boolean,
  ): Promise<string | undefined> {
    const forTrends = job.scheduleId != null && job.jobType === ResearchJobType.TRENDS;
    if (!deps.recordReportSnapshot || (!forTrends && !forChannels)) {
      return undefined;
    }
    try {
      const { snapshotId } = await deps.recordReportSnapshot({ job, title, markdown });
      await methods.archiveSnapshots([snapshotId]);
      await methods.updateResearchJob(job.id, { reportSnapshotId: snapshotId });
      return snapshotId;
    } catch (error) {
      log.warn(`[research] Could not keep the report of job ${job.id}`, error);
      return undefined;
    }
  }

  async function sendChannel(
    job: IResearchJob,
    record: IResearchJob['deliveries'][number],
    config: TResearchConfig | undefined,
  ): Promise<void> {
    const channel = record.channel as DeliveryChannel['channel'];
    const implementation = deps.channels?.find((c) => c.channel === channel);
    const fail = (code: string) =>
      methods.recordResearchDeliveryAttempt(job.id, channel, { state: 'failed', error: code });
    if (!implementation) {
      await fail('channel_unavailable');
      return;
    }
    const [snapshot] = job.reportSnapshotId
      ? await methods.getSnapshotsByIds([job.reportSnapshotId], job.user)
      : [];
    const markdown = snapshot ? await deps.reader.read(snapshot) : null;
    if (!markdown) {
      await fail('report_unavailable');
      return;
    }
    let result: ChannelSendResult;
    try {
      result = await implementation.send({ job, title: reportTitle(job), markdown });
    } catch (error) {
      log.warn(`[research] ${channel} delivery threw for job ${job.id}`, error);
      result = { ok: false, code: `${channel}_failed`, retryable: true };
    }
    if (result.ok) {
      await methods.recordResearchDeliveryAttempt(job.id, channel, { state: 'sent' });
      return;
    }
    const attempts = (record.attempts ?? 0) + 1;
    const maxAttempts = config?.delivery.maxAttempts ?? 5;
    if (!result.retryable || attempts >= maxAttempts) {
      await fail(result.code);
      return;
    }
    await methods.recordResearchDeliveryAttempt(job.id, channel, {
      state: 'pending',
      error: result.code,
      nextAttemptAt: deliveryRetryAt(now(), config?.delivery.retryBaseSeconds ?? 60, attempts),
    });
  }

  /** Sends due channel deliveries; each channel retries on its own, the job stays delivered. */
  async function processChannelDeliveries(): Promise<void> {
    for (let index = 0; index < VERIFY_BATCH; index++) {
      const at = now();
      const job = await runAsSystem(() =>
        methods.claimResearchDeliveries({
          instanceId: deps.instanceId,
          leaseMs: VERIFY_LEASE_MS,
          now: at,
        }),
      );
      if (!job) {
        return;
      }
      try {
        await inTenant(job, async () => {
          const config = await deps.getConfig(principalOf(job));
          const due = job.deliveries.filter(
            (d) => d.state === 'pending' && d.nextAttemptAt && new Date(d.nextAttemptAt) <= at,
          );
          for (const record of due) {
            await sendChannel(job, record, config);
          }
        });
      } catch (error) {
        log.error(`[research] Channel delivery failed for job ${job.id}`, error);
      } finally {
        await runAsSystem(() => methods.releaseResearchDeliveryLease(job.id, deps.instanceId));
      }
    }
  }

  /** Counts a failed attempt while the lease is held; at the limit the job fails rather than spin. */
  /** Returns whether to release the lease: yes once the job is terminal. */
  async function recordVerificationFailure(job: IResearchJob): Promise<boolean> {
    const config = await deps.getConfig(principalOf(job));
    const attempts = (job.verificationAttempts ?? 0) + 1;
    if (attempts < (config?.verification.maxAttempts ?? 5)) {
      await runAsSystem(() =>
        methods.updateResearchJob(job.id, { verificationAttempts: attempts }),
      );
      return false;
    }
    await runAsSystem(() =>
      methods.transitionResearchJob(job.id, 'verifying', 'failed', {
        verificationAttempts: attempts,
        failureReason: 'verification_failed',
        completedAt: now(),
      }),
    );
    return true;
  }

  async function processVerification(): Promise<void> {
    for (let index = 0; index < VERIFY_BATCH; index++) {
      const job = await runAsSystem(() =>
        methods.claimResearchJob({
          statuses: ['verifying'],
          instanceId: deps.instanceId,
          leaseMs: VERIFY_LEASE_MS,
          now: now(),
        }),
      );
      if (!job) {
        return;
      }
      let release = true;
      try {
        await inTenant(job, () => verifyAndDeliver(job));
      } catch (error) {
        log.error(`[research] Verification or delivery failed for job ${job.id}`, error);
        /** A retryable failure keeps its lease, which then works as the retry backoff. */
        release = await recordVerificationFailure(job).catch((recordError) => {
          log.error(`[research] Could not record the failure of job ${job.id}`, recordError);
          return true;
        });
      } finally {
        if (release) {
          await runAsSystem(() => methods.releaseResearchJobLease(job.id, deps.instanceId));
        }
      }
    }
  }

  /** One worker pass: budget watchdog, deadline enforcement, then leased verification. */
  async function tick(): Promise<void> {
    const at = now();
    await stopAtDraftThreshold(at);
    await forcePastDeadline(at);
    await processVerification();
    await processChannelDeliveries();
  }

  async function listJobs(userId: string): Promise<IResearchJob[]> {
    return methods.getResearchJobsByUser(userId);
  }

  async function getJob(jobId: string, userId: string): Promise<IResearchJob | null> {
    return methods.getResearchJobById(jobId, userId);
  }

  return { admitSubmission, settlePhase, cancel, tick, listJobs, getJob };
}
