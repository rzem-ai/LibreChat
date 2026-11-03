import { createHash } from 'node:crypto';
import { tool } from '@librechat/agents/langchain/tools';
import type { GenericTool } from '@librechat/agents';
import type { TResearchConfig } from '../contract/research';
import type { FeedMethods, IResearchJob, ResearchMethods } from '../db';
import type { SearchClient, SearchFreshness } from './search';
import type { SnapshotSourceKind } from '../contract/types';
import type { SnapshotRecorder } from './snapshots';
import type { DocumentGateway } from './documents';
import type { UploadSearch } from './uploads';
import type { PageFetcher } from './fetch';
import {
  MAX_DRAFT_CHARS,
  MAX_BRIEF_CHARS,
  fetchPageSchema,
  searchWebSchema,
  submitDraftSchema,
  submitBriefSchema,
  readDocumentSchema,
  RESEARCH_TOOL_NAMES,
  recordFindingSchema,
  searchUploadsSchema,
  readFeedItemsSchema,
  RESEARCH_TOOL_DESCRIPTIONS,
} from '../contract/research';
import { documentToMarkdown, DocumentError } from './documents';
import { normaliseReference, urlHash } from './references';
import { PageFetchError, pageToMarkdown } from './fetch';
import { allowedSourceKinds } from './phases';
import { SearchError } from './search';

/** Characters of snapshot content returned to the model per call; the snapshot keeps it all. */
const MAX_TOOL_CONTENT_CHARS = 20_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DEFAULT_FEED_HOURS = 24;
const FEED_EXCERPT_CHARS = 600;
/** Newest URL hashes kept per job for the known-URL rule. */
const KNOWN_URL_CAP = 5000;

export type ResearchToolContext = {
  userId: string;
  tenantId?: string;
  conversationId: string;
  /**
   * True only for the user's own request (the brief phase). Trigger-dispatched phases
   * run without the user's token, so internal documents cannot be read there (5.9).
   */
  isLiveRequest: boolean;
  signal?: AbortSignal;
};

export type ResearchToolDeps = {
  methods: Pick<
    ResearchMethods,
    | 'getLiveResearchJobByConversation'
    | 'markResearchBudgetExhausted'
    | 'consumeResearchStep'
    | 'reserveResearchDocument'
    | 'releaseResearchDocument'
    | 'addResearchKnownUrls'
    | 'getSnapshotById'
    | 'getSnapshotsByIds'
    | 'appendResearchNotes'
    | 'updateResearchJob'
    | 'addResearchInputSnapshots'
  > &
    Pick<FeedMethods, 'getFeedSubscriptions' | 'getFeedItems'>;
  config: TResearchConfig;
  recorder: SnapshotRecorder;
  fetcher: PageFetcher;
  search?: SearchClient;
  documents?: DocumentGateway;
  uploads?: UploadSearch;
  /** Installed gateway token provider (phase 4): documents readable in detached phases. */
  detachedDocuments?: boolean;
  now?: () => Date;
};

/** A refusal or failure the model can act on: a stable code plus one sentence. */
function refusal(code: string, message: string): string {
  return JSON.stringify({ error: code, message });
}

function truncate(text: string): { content: string; truncated: boolean } {
  return text.length > MAX_TOOL_CONTENT_CHARS
    ? { content: text.slice(0, MAX_TOOL_CONTENT_CHARS), truncated: true }
    : { content: text, truncated: false };
}

const NO_JOB = refusal('no_research_job', 'No research job is running in this conversation.');
const URL_NOT_KNOWN = refusal(
  'url_not_known',
  'This job can read internal documents, so it only fetches URLs the user gave or that search_web returned. Search for a page to fetch it.',
);
const BUDGET_GONE = refusal(
  'budget_exhausted',
  'The research budget is exhausted. Stop researching and finish the current phase with what you have.',
);

/**
 * Builds the research tools for one request. Every call re-reads the live job for this
 * conversation and user, so a tool never acts on another user's job, a finished job, or a
 * phase the job has left. Research tools write a snapshot before returning content, which
 * is what makes "agents never read a live page directly" hold in code.
 */
export function createResearchTools(
  ctx: ResearchToolContext,
  deps: ResearchToolDeps,
): GenericTool[] {
  const { methods, config } = deps;
  const now = deps.now ?? (() => new Date());

  const loadJob = () => methods.getLiveResearchJobByConversation(ctx.conversationId, ctx.userId);

  /**
   * Jobs that can see internal sources only fetch URLs from the user's prompt or from
   * search results. Links on fetched pages are attacker-chosen, so following them would
   * let a hostile page build a covert channel out of the model's link choices.
   */
  const readsInternal = (job: IResearchJob) =>
    allowedSourceKinds(job.jobType, job.invocationMode, {
      delegatedDocuments: deps.detachedDocuments,
    }).some((kind) => kind === 'document' || kind === 'upload');

  const learnUrls = async (job: IResearchJob, urls: string[]) => {
    if (!readsInternal(job)) {
      return;
    }
    const hashes = urls.map(urlHash).filter((hash): hash is string => hash != null);
    await methods.addResearchKnownUrls(job.id, hashes, KNOWN_URL_CAP);
  };

  /**
   * Resolves the job, checks the phase and source kind, and atomically consumes one step,
   * so parallel subagent calls cannot overrun the budget.
   */
  async function beginResearch(
    kind: SnapshotSourceKind,
  ): Promise<{ job: IResearchJob } | { refused: string }> {
    const job = await loadJob();
    if (!job) {
      return { refused: NO_JOB };
    }
    if (
      !allowedSourceKinds(job.jobType, job.invocationMode, {
        delegatedDocuments: deps.detachedDocuments,
      }).includes(kind)
    ) {
      return {
        refused: refusal('source_not_allowed', `This job may not use ${kind} sources.`),
      };
    }
    if (kind === 'web' && job.status === 'briefing') {
      return {
        refused: refusal(
          'wrong_phase',
          'Web research starts after the brief. Write the brief first.',
        ),
      };
    }
    if (job.budgetExhaustedAt) {
      return { refused: BUDGET_GONE };
    }
    if (!(await methods.consumeResearchStep(job.id))) {
      /** Marks the job so the phase settles as partial and drafting starts. */
      await methods.markResearchBudgetExhausted(job.id, now());
      return { refused: BUDGET_GONE };
    }
    return { job };
  }

  const record = (input: Parameters<SnapshotRecorder['record']>[0]) =>
    deps.recorder.record({ ...input, ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}) });

  const searchWeb = tool(
    async ({ query, freshness }) => {
      const started = await beginResearch('web');
      if ('refused' in started) {
        return started.refused;
      }
      if (!deps.search) {
        return refusal('search_unconfigured', 'Web search is not configured.');
      }
      try {
        const results = await deps.search.search(query, {
          count: config.search.count,
          freshness: freshness as SearchFreshness | undefined,
          signal: ctx.signal,
        });
        await learnUrls(
          started.job,
          results.map((result) => result.url),
        );
        return JSON.stringify({
          results,
          note: 'Search results are not citable. Call fetch_page on a result to read and cite it.',
        });
      } catch (error) {
        return error instanceof SearchError
          ? refusal(error.code, error.message)
          : refusal('search_failed', 'Web search failed.');
      }
    },
    {
      name: RESEARCH_TOOL_NAMES.searchWeb,
      description: RESEARCH_TOOL_DESCRIPTIONS[RESEARCH_TOOL_NAMES.searchWeb],
      schema: searchWebSchema,
    },
  );

  const fetchPage = tool(
    async ({ url }) => {
      const started = await beginResearch('web');
      if ('refused' in started) {
        return started.refused;
      }
      if (readsInternal(started.job)) {
        const hash = urlHash(url);
        if (!hash || !(started.job.knownUrlHashes ?? []).includes(hash)) {
          return URL_NOT_KNOWN;
        }
      }
      try {
        const page = await deps.fetcher.fetch(url, ctx.signal);
        const { title, markdown } = pageToMarkdown(page);
        if (!markdown.trim()) {
          return refusal('fetch_empty', 'The page has no readable text.');
        }
        const snapshot = await record({
          userId: ctx.userId,
          sourceKind: 'web',
          reference: page.finalUrl,
          url: page.finalUrl,
          ...(title ? { title } : {}),
          markdown,
        });
        return JSON.stringify({
          snapshot_id: snapshot.id,
          url: page.finalUrl,
          title: title ?? null,
          ...truncate(markdown),
        });
      } catch (error) {
        return error instanceof PageFetchError
          ? refusal(error.code, error.message)
          : refusal('fetch_failed', 'The page could not be fetched.');
      }
    },
    {
      name: RESEARCH_TOOL_NAMES.fetchPage,
      description: RESEARCH_TOOL_DESCRIPTIONS[RESEARCH_TOOL_NAMES.fetchPage],
      schema: fetchPageSchema,
    },
  );

  const readDocument = tool(
    async ({ reference }) => {
      const started = await beginResearch('document');
      if ('refused' in started) {
        return started.refused;
      }
      const { job } = started;
      if (!(job.documentReferences ?? []).includes(normaliseReference(reference))) {
        return refusal(
          'document_not_named',
          'Only documents the user named when submitting the job can be read.',
        );
      }
      if (!ctx.isLiveRequest && !deps.detachedDocuments) {
        return refusal(
          'documents_need_live_session',
          'Internal documents can only be read while the user is submitting the job. Use the documents already read; the user can submit a follow-up job naming more.',
        );
      }
      if (!deps.documents) {
        return refusal('documents_unconfigured', 'Document access is not configured.');
      }
      if (ctx.isLiveRequest && !deps.detachedDocuments) {
        const startedAtMs = job.startedAt ? new Date(job.startedAt).getTime() : now().getTime();
        if (now().getTime() - startedAtMs > config.submitFetch.maxMinutes * MINUTE_MS) {
          return refusal(
            'submission_window_closed',
            'The time allowed for reading documents at submission has passed.',
          );
        }
      }
      if (!(await methods.reserveResearchDocument(job.id, config.submitFetch.maxDocuments))) {
        return refusal(
          'document_limit',
          `This job has already read the maximum of ${config.submitFetch.maxDocuments} documents.`,
        );
      }
      try {
        const doc = await deps.documents.fetchDocument({ reference, signal: ctx.signal });
        const converted = documentToMarkdown(doc);
        const snapshot = await record({
          userId: ctx.userId,
          sourceKind: 'document',
          reference: converted.reference,
          stableReference: true,
          ...(doc.webUrl ? { url: doc.webUrl } : {}),
          ...(doc.title ? { title: doc.title } : {}),
          markdown: converted.markdown,
        });
        await methods.addResearchInputSnapshots(job.id, [snapshot.id]);
        return JSON.stringify({
          snapshot_id: snapshot.id,
          title: doc.title ?? null,
          sections: converted.sections.map((section) => section.anchor),
          note: 'Cite a section with [[cite:<snapshot_id>#<section anchor>]].',
          ...truncate(converted.markdown),
        });
      } catch (error) {
        await methods.releaseResearchDocument(job.id);
        return error instanceof DocumentError
          ? refusal(error.code, error.message)
          : refusal('document_unavailable', 'The document could not be fetched.');
      }
    },
    {
      name: RESEARCH_TOOL_NAMES.readDocument,
      description: RESEARCH_TOOL_DESCRIPTIONS[RESEARCH_TOOL_NAMES.readDocument],
      schema: readDocumentSchema,
    },
  );

  const searchUploads = tool(
    async ({ query }) => {
      const started = await beginResearch('upload');
      if ('refused' in started) {
        return started.refused;
      }
      const fileIds = started.job.uploadFileIds ?? [];
      if (!deps.uploads || fileIds.length === 0) {
        return refusal('no_uploads', 'This job has no uploaded files to search.');
      }
      const hits = await deps.uploads.search({
        userId: ctx.userId,
        fileIds,
        query,
        signal: ctx.signal,
      });
      const results = await Promise.all(
        hits.map(async (hit) => {
          const locator =
            hit.page != null
              ? `page-${hit.page}`
              : `chunk-${createHash('sha256').update(hit.content).digest('hex').slice(0, 12)}`;
          const snapshot = await record({
            userId: ctx.userId,
            sourceKind: 'upload',
            reference: `${hit.fileId}#${locator}`,
            stableReference: true,
            title: hit.filename,
            markdown: hit.content,
          });
          return {
            snapshot_id: snapshot.id,
            filename: hit.filename,
            ...(hit.page != null ? { page: hit.page } : {}),
            content: hit.content,
          };
        }),
      );
      return JSON.stringify({ results });
    },
    {
      name: RESEARCH_TOOL_NAMES.searchUploads,
      description: RESEARCH_TOOL_DESCRIPTIONS[RESEARCH_TOOL_NAMES.searchUploads],
      schema: searchUploadsSchema,
    },
  );

  const readFeedItems = tool(
    async ({ since_hours, limit }) => {
      const started = await beginResearch('rss');
      if ('refused' in started) {
        return started.refused;
      }
      const subscriptions = await methods.getFeedSubscriptions(ctx.userId);
      if (subscriptions.length === 0) {
        return refusal('no_feeds', 'The user has no feed subscriptions.');
      }
      const cap = Math.min(limit ?? config.jobs.digest.maxItems, config.jobs.digest.maxItems);
      /** A scheduled digest reads from its last delivered run unless the model asks otherwise. */
      const window = started.job.feedsSince
        ? new Date(started.job.feedsSince)
        : new Date(now().getTime() - DEFAULT_FEED_HOURS * HOUR_MS);
      const since =
        since_hours != null ? new Date(now().getTime() - since_hours * HOUR_MS) : window;
      const items = await methods.getFeedItems({
        feedIds: subscriptions.map((subscription) => subscription.feedId),
        since,
        limit: cap,
      });
      const snapshots = await methods.getSnapshotsByIds(
        items.map((item) => item.snapshotId),
        ctx.userId,
      );
      const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
      const feedTitles = new Map(
        subscriptions.map((s) => [s.feedId, s.label ?? s.feed?.title ?? s.feed?.url ?? s.feedId]),
      );
      const results = await Promise.all(
        items.map(async (item) => {
          const snapshot = byId.get(item.snapshotId);
          const body = snapshot ? await deps.recorder.reader.read(snapshot, ctx.signal) : null;
          return {
            snapshot_id: item.snapshotId,
            title: item.title ?? null,
            link: item.link ?? null,
            published_at: new Date(item.publishedAt).toISOString(),
            feed: feedTitles.get(item.feedId),
            excerpt: body ? body.slice(0, FEED_EXCERPT_CHARS) : null,
          };
        }),
      );
      return JSON.stringify({ since: since.toISOString(), items: results });
    },
    {
      name: RESEARCH_TOOL_NAMES.readFeedItems,
      description: RESEARCH_TOOL_DESCRIPTIONS[RESEARCH_TOOL_NAMES.readFeedItems],
      schema: readFeedItemsSchema,
    },
  );

  const recordFinding = tool(
    async ({ claim, snapshot_id, locator }) => {
      const job = await loadJob();
      if (!job) {
        return NO_JOB;
      }
      const snapshot = await methods.getSnapshotById(snapshot_id, ctx.userId);
      if (!snapshot) {
        return refusal(
          'unknown_snapshot',
          'That snapshot id does not exist for this user. Only cite snapshot ids returned by the research tools.',
        );
      }
      /** Findings count against the budget but are still recorded once it is spent. */
      await methods.consumeResearchStep(job.id);
      const before = job.notes?.length ?? 0;
      const cap = config.verification.maxClaims;
      const stored = await methods.appendResearchNotes(
        job.id,
        [{ claim: claim.trim(), snapshotId: snapshot_id, ...(locator ? { locator } : {}) }],
        cap,
      );
      if (stored <= before && stored >= cap) {
        return refusal('notes_full', `This job already holds the maximum of ${cap} findings.`);
      }
      return JSON.stringify({ status: 'recorded', findings: stored });
    },
    {
      name: RESEARCH_TOOL_NAMES.recordFinding,
      description: RESEARCH_TOOL_DESCRIPTIONS[RESEARCH_TOOL_NAMES.recordFinding],
      schema: recordFindingSchema,
    },
  );

  const submitBrief = tool(
    async ({ brief }) => {
      const job = await loadJob();
      if (!job) {
        return NO_JOB;
      }
      if (job.status !== 'briefing') {
        return refusal('wrong_phase', 'The brief can only be submitted in the brief phase.');
      }
      await methods.updateResearchJob(job.id, { brief: brief.trim().slice(0, MAX_BRIEF_CHARS) });
      return JSON.stringify({ status: 'saved' });
    },
    {
      name: RESEARCH_TOOL_NAMES.submitBrief,
      description: RESEARCH_TOOL_DESCRIPTIONS[RESEARCH_TOOL_NAMES.submitBrief],
      schema: submitBriefSchema,
    },
  );

  const submitDraft = tool(
    async ({ markdown }) => {
      const job = await loadJob();
      if (!job) {
        return NO_JOB;
      }
      if (job.status !== 'drafting') {
        return refusal('wrong_phase', 'The draft can only be submitted in the drafting phase.');
      }
      await methods.updateResearchJob(job.id, { draft: markdown.slice(0, MAX_DRAFT_CHARS) });
      return JSON.stringify({ status: 'saved' });
    },
    {
      name: RESEARCH_TOOL_NAMES.submitDraft,
      description: RESEARCH_TOOL_DESCRIPTIONS[RESEARCH_TOOL_NAMES.submitDraft],
      schema: submitDraftSchema,
    },
  );

  return [
    searchWeb,
    fetchPage,
    readDocument,
    searchUploads,
    readFeedItems,
    recordFinding,
    submitBrief,
    submitDraft,
  ] as unknown as GenericTool[];
}
