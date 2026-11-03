/** The five research jobs. Values double as `research.jobs.<key>` config keys. */
export enum ResearchJobType {
  REQUIREMENTS = 'requirements',
  CURRENT_EVENTS = 'currentEvents',
  TRENDS = 'trends',
  DIGEST = 'digest',
  SOLUTION = 'solution',
}

/** Fixed agent ids. Seeded once, admin edits win on later boots. */
export const RESEARCH_AGENT_IDS: Record<ResearchJobType, string> = {
  [ResearchJobType.REQUIREMENTS]: 'agent_research_requirements',
  [ResearchJobType.CURRENT_EVENTS]: 'agent_research_current_events',
  [ResearchJobType.TRENDS]: 'agent_research_trends',
  [ResearchJobType.DIGEST]: 'agent_research_digest',
  [ResearchJobType.SOLUTION]: 'agent_research_solution',
};

const AGENT_JOB_TYPES: ReadonlyMap<string, ResearchJobType> = new Map(
  Object.entries(RESEARCH_AGENT_IDS).map(([type, id]) => [id, type as ResearchJobType]),
);

/** The job type a fixed research agent id runs; constant time, no database. */
export function researchJobTypeForAgent(agentId: string | undefined): ResearchJobType | undefined {
  return agentId ? AGENT_JOB_TYPES.get(agentId) : undefined;
}

/** False only for a research agent whose job needs a live user (design 5.9). */
export function isSchedulableAgent(agentId: string | undefined): boolean {
  const jobType = researchJobTypeForAgent(agentId);
  return jobType == null || SCHEDULABLE_RESEARCH_JOB_TYPES.includes(jobType);
}

const firstLine = (lines: string[]) => lines.map((line) => line.trim()).find(Boolean);
const isHeading = (line: string) => /^#{1,6}\s/.test(line.trim());

/**
 * One line naming what a job is about, for titles and job cards: the first line under
 * the brief's Question heading, else the brief's first non-heading line, else the prompt's
 * first line. Briefs always open with a heading, so their first line is never the subject.
 */
export function researchBriefSubject(brief: string | undefined, prompt: string): string {
  const lines = (brief ?? '').split('\n');
  const question = lines.findIndex((line) => /^#{1,6}\s+question\b/i.test(line.trim()));
  if (question >= 0) {
    const next = lines.slice(question + 1);
    const end = next.findIndex(isHeading);
    const subject = firstLine(end >= 0 ? next.slice(0, end) : next);
    if (subject) {
      return subject;
    }
  }
  return firstLine(lines.filter((line) => !isHeading(line))) ?? firstLine(prompt.split('\n')) ?? '';
}

export const RESEARCH_AGENT_CATEGORY = 'research';

/** Jobs that may run unattended. The other two need a live user token (design 5.9). */
export const SCHEDULABLE_RESEARCH_JOB_TYPES: ReadonlyArray<ResearchJobType> = [
  ResearchJobType.CURRENT_EVENTS,
  ResearchJobType.TRENDS,
  ResearchJobType.DIGEST,
];

export const researchJobStatuses = [
  'submitted',
  'briefing',
  'researching',
  'drafting',
  'verifying',
  'delivered',
  'failed',
  'cancelled',
] as const;
export type ResearchJobStatus = (typeof researchJobStatuses)[number];

export const researchInvocationModes = ['interactive', 'delegated'] as const;
export type ResearchInvocationMode = (typeof researchInvocationModes)[number];

export const snapshotSourceKinds = ['web', 'rss', 'document', 'upload', 'priorReport'] as const;
export type SnapshotSourceKind = (typeof snapshotSourceKinds)[number];

export const citationStates = ['supported', 'unsupported', 'unavailable'] as const;
export type CitationState = (typeof citationStates)[number];

export const researchDeliveryChannels = ['conversation', 'email', 'teams'] as const;
export type ResearchDeliveryChannel = (typeof researchDeliveryChannels)[number];

export const deliveryStates = ['pending', 'sent', 'failed'] as const;
export type DeliveryState = (typeof deliveryStates)[number];

export type TResearchBudget = {
  wallClockMinutes: number;
  maxSteps: number;
};

export type TResearchBudgetUsed = {
  elapsedMs: number;
  steps: number;
};

export type TResearchNote = {
  claim: string;
  snapshotId: string;
  locator?: string;
};

export type TVerificationSummary = {
  supported: number;
  unsupported: number;
  unavailable: number;
  total: number;
  scopeNotes?: string;
  /** Prose sentences carrying no citation; absent when there are none. */
  uncited?: number;
};

export type TDeliveryRecord = {
  channel: ResearchDeliveryChannel;
  state: DeliveryState;
  /** Stable failure code, such as `email_failed`. */
  error?: string;
  attempts?: number;
  updatedAt?: string;
};

/** Wire shape of a research job: the owner's view, without drafts, notes or internals. */
export type TResearchJob = {
  id: string;
  agentId: string;
  jobType: ResearchJobType;
  invocationMode: ResearchInvocationMode;
  status: ResearchJobStatus;
  partial: boolean;
  prompt: string;
  brief?: string;
  budget: TResearchBudget;
  budgetUsed: TResearchBudgetUsed;
  conversationId: string;
  reportFileId?: string;
  findingsCount: number;
  citedCount: number;
  verification?: TVerificationSummary;
  deliveries: TDeliveryRecord[];
  scheduleId?: string;
  failureReason?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** Whether research agents are enabled; the client shows research entry points only when they are. */
export type TResearchStatus = { enabled: boolean };

export type TResearchJobsResponse = {
  jobs: TResearchJob[];
};

export type TSnapshot = {
  id: string;
  user?: string | null;
  sourceKind: SnapshotSourceKind;
  reference: string;
  title?: string;
  url?: string;
  fetchedAt: string;
  contentHash: string;
  archived: boolean;
};

export const feedPollStatuses = ['ok', 'not_modified', 'error'] as const;
export type FeedPollStatus = (typeof feedPollStatuses)[number];

export const feedSubscriptionSources = ['opml', 'catalogue', 'manual'] as const;
export type FeedSubscriptionSource = (typeof feedSubscriptionSources)[number];

/** A shared feed as users see it: no validators, leases or subscriber counts. */
export type TResearchFeed = {
  id: string;
  url: string;
  title?: string;
  siteUrl?: string;
  lastPolledAt?: string;
  lastStatus?: FeedPollStatus;
  /** Stable failure code from the last poll, such as `fetch_status` or `feed_invalid`. */
  lastError?: string;
  disabled: boolean;
  catalogue: boolean;
  catalogueCategory?: string;
};

export type TResearchFeedSubscription = {
  feedId: string;
  label?: string;
  /** Folder path, outermost first; absent for an unfiled feed. */
  folder?: string[];
  source: FeedSubscriptionSource;
  createdAt?: string;
  feed?: TResearchFeed;
};

export type TResearchFeedsResponse = {
  subscriptions: TResearchFeedSubscription[];
  maxPerUser: number;
};

export type TResearchCatalogueResponse = {
  feeds: TResearchFeed[];
};

export type TResearchFeedItem = {
  guid: string;
  title?: string;
  link?: string;
  publishedAt: string;
  archived: boolean;
};

export type TResearchFeedItemsResponse = {
  feedId: string;
  items: TResearchFeedItem[];
};

export type TOpmlImportRequest = {
  opml: string;
};

export type TOpmlImportResult = {
  /** Feeds newly subscribed. */
  added: number;
  /** Feeds the user already subscribed to. */
  existing: number;
  /** Feeds left out because the per-user cap was reached. */
  overLimit: number;
  maxPerUser: number;
};

/** Files a feed under a folder path, or unfiles it with null. */
export type TResearchFeedMove = {
  folder: string[] | null;
};

export type TResearchFeedFolderRename = {
  from: string[];
  to: string[];
};

/** Admin request to add a feed URL to the catalogue. */
export type TCatalogueFeedRequest = {
  url: string;
  category?: string;
};

/** Admin request to change a feed's catalogue listing or re-enable a disabled feed. */
export type TCatalogueFeedUpdate = {
  catalogue?: boolean;
  category?: string;
  disabled?: boolean;
};

/** A schedule whose agent is a research agent, with its research delivery settings. */
export type TResearchSchedule = {
  scheduleId: string;
  name: string;
  agentId: string;
  jobType: ResearchJobType;
  enabled: boolean;
  channels: ResearchDeliveryChannel[];
  /** Channels this deployment can send to; `conversation` is always present. */
  availableChannels: ResearchDeliveryChannel[];
};

export type TResearchSchedulesResponse = {
  schedules: TResearchSchedule[];
};

export type TResearchScheduleUpdate = {
  channels: ResearchDeliveryChannel[];
};
