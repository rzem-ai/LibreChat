import type { Document, Types } from 'mongoose';
import type {
  CitationState,
  DeliveryState,
  ResearchJobType,
  ResearchJobStatus,
  SnapshotSourceKind,
  ResearchInvocationMode,
  ResearchDeliveryChannel,
} from '../../contract/types';

export interface IResearchBudget {
  wallClockMinutes: number;
  maxSteps: number;
}

export interface IResearchBudgetUsed {
  elapsedMs: number;
  steps: number;
}

export interface IResearchNote {
  claim: string;
  snapshotId: string;
  locator?: string;
}

export interface IVerificationSummary {
  supported: number;
  unsupported: number;
  unavailable: number;
  total: number;
  scopeNotes?: string;
  /** Prose sentences carrying no citation; absent when there are none. */
  uncited?: number;
}

export interface ICitationResult {
  claim: string;
  snapshotId: string;
  locator?: string;
  state: CitationState;
}

export interface IDeliveryRecord {
  channel: ResearchDeliveryChannel;
  state: DeliveryState;
  /** Stable failure code from the last attempt. */
  error?: string;
  /** Send attempts so far; each channel retries independently of the job. */
  attempts?: number;
  /** When a pending channel is next due. */
  nextAttemptAt?: Date;
  updatedAt?: Date;
}

export interface IResearchJob {
  _id?: Types.ObjectId;
  id: string;
  user: Types.ObjectId;
  tenantId?: string;
  agentId: string;
  jobType: ResearchJobType;
  invocationMode: ResearchInvocationMode;
  status: ResearchJobStatus;
  /** True when a budget ran out and the report was built from what existed. */
  partial: boolean;
  prompt: string;
  brief?: string;
  draft?: string;
  notes?: IResearchNote[];
  budget: IResearchBudget;
  budgetUsed: IResearchBudgetUsed;
  conversationId: string;
  /** Latest persisted message in the conversation; the parent for `continue` triggers. */
  parentMessageId?: string;
  /** Snapshots fetched at submission (documents, uploads) before the job detached. */
  inputSnapshotIds: string[];
  /** LibreChat upload file ids attached at submission; searched by `search_uploads`. */
  uploadFileIds?: string[];
  /** Document references the user named at submission; read_document accepts only these. */
  documentReferences?: string[];
  /** Documents read so far; reserved atomically against submitFetch.maxDocuments. */
  documentsRead?: number;
  /** Hashes of URLs the job has seen (prompt, search results, page links). Jobs with
   *  internal sources only fetch these, so a model cannot build an exfiltration URL. */
  knownUrlHashes?: string[];
  reportFileId?: string;
  citedSnapshotIds: string[];
  verification?: IVerificationSummary;
  citations?: ICitationResult[];
  deliveries: IDeliveryRecord[];
  scheduleId?: string;
  failureReason?: string;
  cancelRequested?: boolean;
  /** Idempotency key of the generation currently running this job's phase. Settlement
   *  is accepted only from the request carrying this key, so no other run can advance it. */
  phaseDeliveryKey?: string;
  /** Wall-clock point past which the job stops researching and drafts (threshold x budget). */
  draftAt?: Date;
  /** Wall-clock budget end. A live job past this is forced to deliver what it has. */
  deadlineAt?: Date;
  /** Set when the watchdog stopped research for budget; the next settlement skips to drafting. */
  budgetExhaustedAt?: Date;
  /** Failed verification or delivery attempts; the job fails at verification.maxAttempts. */
  verificationAttempts?: number;
  leaseUntil?: Date;
  leaseBy?: string;
  /** Lease for sending extra delivery channels after the report is delivered. */
  deliveryLeaseUntil?: Date;
  deliveryLeaseBy?: string;
  /** The delivered report as a snapshot, loaded as a prior report by the next trends run. */
  reportSnapshotId?: string;
  /** Digest window start: feed items published since the schedule's last delivered run. */
  feedsSince?: Date;
  startedAt?: Date;
  phaseStartedAt?: Date;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IResearchJobDocument extends Omit<IResearchJob, 'id' | '_id'>, Document {
  id: string;
}

export interface ISnapshot {
  _id?: Types.ObjectId;
  id: string;
  /** Null for feed items, which are shared public content. */
  user?: Types.ObjectId | null;
  tenantId?: string;
  sourceKind: SnapshotSourceKind;
  /** Stable reference per kind (design 5.4): URL plus fetch time, item link plus published time,
   *  site/drive/item plus anchor, file id plus locator, or job id. */
  reference: string;
  title?: string;
  url?: string;
  /** Feed id for `rss` snapshots. */
  feedId?: string;
  /** Storage key in the deployment's file strategy; the markdown body lives there. */
  storageKey: string;
  fileStrategy: string;
  contentHash: string;
  bytes?: number;
  fetchedAt: Date;
  archived: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISnapshotDocument extends Omit<ISnapshot, 'id' | '_id'>, Document {
  id: string;
}

/** Research settings for one schedule, kept beside the upstream `Schedule` row (design 5.7). */
export interface IResearchSchedule {
  _id?: Types.ObjectId;
  scheduleId: string;
  user: Types.ObjectId;
  tenantId?: string;
  jobType: ResearchJobType;
  channels: ResearchDeliveryChannel[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IResearchScheduleDocument extends Omit<IResearchSchedule, '_id'>, Document {}
