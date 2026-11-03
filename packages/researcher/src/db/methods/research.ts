import { createIndexesWithRetry } from '@librechat/data-schemas';
import type { Model, Types } from 'mongoose';
import type {
  ISnapshot,
  IResearchJob,
  IDeliveryRecord,
  ISnapshotDocument,
  IResearchSchedule,
  IResearchJobDocument,
  IResearchScheduleDocument,
} from '../types/research';
import type {
  DeliveryState,
  ResearchJobStatus,
  ResearchDeliveryChannel,
} from '../../contract/types';

type UserId = string | Types.ObjectId;

/** Statuses that occupy a user's concurrency slot and can still be cancelled. */
export const LIVE_RESEARCH_STATUSES: ResearchJobStatus[] = [
  'submitted',
  'briefing',
  'researching',
  'drafting',
  'verifying',
];

export type CancelResearchJobResult = 'cancelled' | 'terminal' | 'missing';

export type ClaimResearchJobParams = {
  statuses: ResearchJobStatus[];
  instanceId: string;
  leaseMs: number;
  now?: Date;
};

export type UpsertResearchScheduleInput = Pick<
  IResearchSchedule,
  'scheduleId' | 'jobType' | 'channels' | 'tenantId'
> & { user: UserId };

export type ResearchDeliveryAttempt = {
  state: IDeliveryRecord['state'];
  error?: string;
  nextAttemptAt?: Date;
};

export type ResearchMethods = {
  ensureResearchIndexes: () => Promise<void>;
  createResearchJob: (data: Partial<IResearchJob>) => Promise<IResearchJob>;
  getResearchJobById: (id: string, userId?: UserId) => Promise<IResearchJob | null>;
  getResearchJobsByUser: (userId: UserId, limit?: number) => Promise<IResearchJob[]>;
  getResearchJobByConversation: (
    conversationId: string,
    userId?: UserId,
  ) => Promise<IResearchJob | null>;
  /** The one live job a conversation may hold; admission refuses a second. */
  getLiveResearchJobByConversation: (
    conversationId: string,
    userId: UserId,
  ) => Promise<IResearchJob | null>;
  countActiveResearchJobs: (userId: UserId) => Promise<number>;
  /** Leases one job in `statuses` whose lease is absent or expired. */
  claimResearchJob: (params: ClaimResearchJobParams) => Promise<IResearchJob | null>;
  releaseResearchJobLease: (id: string, instanceId: string) => Promise<void>;
  /** Briefing or researching jobs past `draftAt` that the watchdog has not flagged. */
  findResearchJobsPastDraftThreshold: (now: Date, limit: number) => Promise<IResearchJob[]>;
  /** Any live, pre-verification job past `deadlineAt`. */
  findResearchJobsPastDeadline: (now: Date, limit: number) => Promise<IResearchJob[]>;
  /** Counts one step if the budget allows it; false once `maxSteps` is reached. Atomic. */
  consumeResearchStep: (id: string) => Promise<boolean>;
  /** Reserves one document read below `max`; false when the cap is reached. Atomic. */
  reserveResearchDocument: (id: string, max: number) => Promise<boolean>;
  releaseResearchDocument: (id: string) => Promise<void>;
  /** Appends URL hashes, keeping only the newest `cap`. */
  addResearchKnownUrls: (id: string, hashes: string[], cap: number) => Promise<void>;
  /** Adds snapshot ids to the job's inputs (deduplicated); returns the stored count. */
  addResearchInputSnapshots: (id: string, snapshotIds: string[]) => Promise<number>;
  /** Appends notes up to `cap` in total; returns the stored count. */
  appendResearchNotes: (
    id: string,
    notes: NonNullable<IResearchJob['notes']>,
    cap: number,
  ) => Promise<number>;
  /** Compare-and-set on `status`; null when the job is not in one of `from`. */
  transitionResearchJob: (
    id: string,
    from: ResearchJobStatus | ResearchJobStatus[],
    to: ResearchJobStatus,
    patch: Partial<IResearchJob>,
  ) => Promise<IResearchJob | null>;
  updateResearchJob: (id: string, patch: Partial<IResearchJob>) => Promise<IResearchJob | null>;
  /** Sets `budgetExhaustedAt` unless already set, so the first stop time wins. */
  markResearchBudgetExhausted: (id: string, at: Date) => Promise<void>;
  cancelResearchJob: (id: string, userId: UserId) => Promise<CancelResearchJobResult>;
  setResearchDelivery: (
    id: string,
    channel: ResearchDeliveryChannel,
    state: DeliveryState,
    error?: string,
  ) => Promise<void>;
  /** Delivered reports for one schedule, newest first (job 3 prior-report loading). */
  getDeliveredResearchJobsForSchedule: (
    userId: UserId,
    scheduleId: string,
    limit: number,
  ) => Promise<IResearchJob[]>;
  /** The newest delivered run of a schedule (job 4's digest window starts there). */
  getLastDeliveredResearchJobForSchedule: (
    userId: UserId,
    scheduleId: string,
  ) => Promise<IResearchJob | null>;
  /** Adds a pending record for each channel the job does not have yet. */
  queueResearchDeliveries: (
    id: string,
    channels: IDeliveryRecord['channel'][],
    now?: Date,
  ) => Promise<void>;
  /** Leases one delivered job with a channel send due; one replica sends at a time. */
  claimResearchDeliveries: (input: {
    instanceId: string;
    leaseMs: number;
    now?: Date;
  }) => Promise<IResearchJob | null>;
  /** Records one send attempt for a channel and counts it. */
  recordResearchDeliveryAttempt: (
    id: string,
    channel: IDeliveryRecord['channel'],
    attempt: ResearchDeliveryAttempt,
  ) => Promise<void>;
  releaseResearchDeliveryLease: (id: string, instanceId: string) => Promise<void>;
  /** Null when the schedule id belongs to another user. */
  upsertResearchSchedule: (input: UpsertResearchScheduleInput) => Promise<IResearchSchedule | null>;
  /** Owner-scoped when `userId` is given. */
  getResearchSchedule: (scheduleId: string, userId?: UserId) => Promise<IResearchSchedule | null>;
  listResearchSchedules: (userId: UserId) => Promise<IResearchSchedule[]>;
  deleteResearchSchedule: (scheduleId: string, userId: UserId) => Promise<boolean>;
  createSnapshot: (data: Partial<ISnapshot>) => Promise<ISnapshot>;
  /** Owner-scoped when `userId` is given; shared (ownerless) snapshots are always visible. */
  getSnapshotById: (id: string, userId?: UserId) => Promise<ISnapshot | null>;
  getSnapshotsByIds: (ids: string[], userId?: UserId) => Promise<ISnapshot[]>;
  findSnapshotByReference: (
    sourceKind: ISnapshot['sourceKind'],
    reference: string,
    userId?: UserId | null,
  ) => Promise<ISnapshot | null>;
  archiveSnapshots: (ids: string[]) => Promise<number>;
  findExpiredSnapshots: (before: Date, limit: number) => Promise<ISnapshot[]>;
  deleteSnapshotsByIds: (ids: string[]) => Promise<number>;
};

function ownerFilter(userId?: UserId) {
  return userId == null ? {} : { user: userId };
}

function visibleSnapshotFilter(userId?: UserId) {
  return userId == null ? {} : { $or: [{ user: userId }, { user: null }] };
}

export function createResearchMethods(mongoose: typeof import('mongoose')): ResearchMethods {
  const ResearchJob = () => mongoose.models.ResearchJob as Model<IResearchJobDocument>;
  const Snapshot = () => mongoose.models.Snapshot as Model<ISnapshotDocument>;
  const ResearchSchedule = () =>
    mongoose.models.ResearchSchedule as Model<IResearchScheduleDocument>;

  async function ensureResearchIndexes(): Promise<void> {
    await createIndexesWithRetry(ResearchJob());
    await createIndexesWithRetry(Snapshot());
    await createIndexesWithRetry(ResearchSchedule());
  }

  async function createResearchJob(data: Partial<IResearchJob>): Promise<IResearchJob> {
    const doc = await ResearchJob().create(data);
    return doc.toObject();
  }

  async function getResearchJobById(id: string, userId?: UserId): Promise<IResearchJob | null> {
    return ResearchJob()
      .findOne({ id, ...ownerFilter(userId) })
      .lean<IResearchJob>();
  }

  async function getResearchJobsByUser(userId: UserId, limit = 100): Promise<IResearchJob[]> {
    return ResearchJob()
      .find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<IResearchJob[]>();
  }

  async function getResearchJobByConversation(
    conversationId: string,
    userId?: UserId,
  ): Promise<IResearchJob | null> {
    return ResearchJob()
      .findOne({ conversationId, ...ownerFilter(userId) })
      .sort({ createdAt: -1 })
      .lean<IResearchJob>();
  }

  async function getLiveResearchJobByConversation(
    conversationId: string,
    userId: UserId,
  ): Promise<IResearchJob | null> {
    return ResearchJob()
      .findOne({ conversationId, user: userId, status: { $in: LIVE_RESEARCH_STATUSES } })
      .lean<IResearchJob>();
  }

  async function claimResearchJob({
    statuses,
    instanceId,
    leaseMs,
    now = new Date(),
  }: ClaimResearchJobParams): Promise<IResearchJob | null> {
    return ResearchJob()
      .findOneAndUpdate(
        {
          status: { $in: statuses },
          $or: [
            { leaseUntil: { $exists: false } },
            { leaseUntil: null },
            { leaseUntil: { $lt: now } },
          ],
        },
        { $set: { leaseUntil: new Date(now.getTime() + leaseMs), leaseBy: instanceId } },
        { new: true, sort: { phaseStartedAt: 1 } },
      )
      .lean<IResearchJob>();
  }

  async function releaseResearchJobLease(id: string, instanceId: string): Promise<void> {
    await ResearchJob().updateOne(
      { id, leaseBy: instanceId },
      { $unset: { leaseUntil: 1, leaseBy: 1 } },
    );
  }

  async function findResearchJobsPastDraftThreshold(
    now: Date,
    limit: number,
  ): Promise<IResearchJob[]> {
    return ResearchJob()
      .find({
        status: { $in: ['briefing', 'researching'] },
        draftAt: { $lte: now },
        budgetExhaustedAt: { $exists: false },
      })
      .sort({ draftAt: 1 })
      .limit(limit)
      .lean<IResearchJob[]>();
  }

  async function findResearchJobsPastDeadline(now: Date, limit: number): Promise<IResearchJob[]> {
    return ResearchJob()
      .find({ status: { $in: ['briefing', 'researching', 'drafting'] }, deadlineAt: { $lte: now } })
      .sort({ deadlineAt: 1 })
      .limit(limit)
      .lean<IResearchJob[]>();
  }

  async function consumeResearchStep(id: string): Promise<boolean> {
    const updated = await ResearchJob().updateOne(
      { id, $expr: { $lt: ['$budgetUsed.steps', '$budget.maxSteps'] } },
      { $inc: { 'budgetUsed.steps': 1 } },
    );
    return updated.modifiedCount === 1;
  }

  async function reserveResearchDocument(id: string, max: number): Promise<boolean> {
    const updated = await ResearchJob().updateOne(
      { id, $or: [{ documentsRead: { $lt: max } }, { documentsRead: { $exists: false } }] },
      { $inc: { documentsRead: 1 } },
    );
    return updated.modifiedCount === 1;
  }

  async function releaseResearchDocument(id: string): Promise<void> {
    await ResearchJob().updateOne(
      { id, documentsRead: { $gt: 0 } },
      { $inc: { documentsRead: -1 } },
    );
  }

  async function addResearchKnownUrls(id: string, hashes: string[], cap: number): Promise<void> {
    if (hashes.length === 0) {
      return;
    }
    await ResearchJob().updateOne(
      { id },
      { $push: { knownUrlHashes: { $each: hashes, $slice: -cap } } },
    );
  }

  async function addResearchInputSnapshots(id: string, snapshotIds: string[]): Promise<number> {
    const updated = await ResearchJob()
      .findOneAndUpdate(
        { id },
        { $addToSet: { inputSnapshotIds: { $each: snapshotIds } } },
        { new: true, projection: { inputSnapshotIds: 1 } },
      )
      .lean<Pick<IResearchJob, 'inputSnapshotIds'>>();
    return updated?.inputSnapshotIds?.length ?? 0;
  }

  async function appendResearchNotes(
    id: string,
    notes: NonNullable<IResearchJob['notes']>,
    cap: number,
  ): Promise<number> {
    const updated = await ResearchJob()
      .findOneAndUpdate(
        { id },
        { $push: { notes: { $each: notes, $slice: cap } } },
        { new: true, projection: { notes: 1 } },
      )
      .lean<Pick<IResearchJob, 'notes'>>();
    return updated?.notes?.length ?? 0;
  }

  async function countActiveResearchJobs(userId: UserId): Promise<number> {
    return ResearchJob().countDocuments({ user: userId, status: { $in: LIVE_RESEARCH_STATUSES } });
  }

  async function transitionResearchJob(
    id: string,
    from: ResearchJobStatus | ResearchJobStatus[],
    to: ResearchJobStatus,
    patch: Partial<IResearchJob>,
  ): Promise<IResearchJob | null> {
    const fromList = Array.isArray(from) ? from : [from];
    return ResearchJob()
      .findOneAndUpdate(
        { id, status: { $in: fromList } },
        { $set: { ...patch, status: to, phaseStartedAt: new Date() } },
        { new: true },
      )
      .lean<IResearchJob>();
  }

  async function updateResearchJob(
    id: string,
    patch: Partial<IResearchJob>,
  ): Promise<IResearchJob | null> {
    return ResearchJob()
      .findOneAndUpdate({ id }, { $set: patch }, { new: true })
      .lean<IResearchJob>();
  }

  async function markResearchBudgetExhausted(id: string, at: Date): Promise<void> {
    await ResearchJob().updateOne(
      { id, budgetExhaustedAt: { $exists: false } },
      { $set: { budgetExhaustedAt: at } },
    );
  }

  async function cancelResearchJob(id: string, userId: UserId): Promise<CancelResearchJobResult> {
    const result = await ResearchJob().updateOne(
      { id, user: userId, status: { $in: LIVE_RESEARCH_STATUSES } },
      { $set: { status: 'cancelled', cancelRequested: true, completedAt: new Date() } },
    );
    if (result.modifiedCount > 0) {
      return 'cancelled';
    }
    const exists = await ResearchJob().exists({ id, user: userId });
    return exists ? 'terminal' : 'missing';
  }

  async function setResearchDelivery(
    id: string,
    channel: ResearchDeliveryChannel,
    state: DeliveryState,
    error?: string,
  ): Promise<void> {
    const record = { channel, state, error, updatedAt: new Date() };
    const updated = await ResearchJob().updateOne(
      { id, 'deliveries.channel': channel },
      { $set: { 'deliveries.$': record } },
    );
    if (updated.matchedCount === 0) {
      await ResearchJob().updateOne({ id }, { $push: { deliveries: record } });
    }
  }

  async function getDeliveredResearchJobsForSchedule(
    userId: UserId,
    scheduleId: string,
    limit: number,
  ): Promise<IResearchJob[]> {
    return ResearchJob()
      .find({ user: userId, scheduleId, status: 'delivered', reportFileId: { $exists: true } })
      .sort({ completedAt: -1 })
      .limit(limit)
      .lean<IResearchJob[]>();
  }

  async function getLastDeliveredResearchJobForSchedule(
    userId: UserId,
    scheduleId: string,
  ): Promise<IResearchJob | null> {
    return ResearchJob()
      .findOne({ user: userId, scheduleId, status: 'delivered' })
      .sort({ completedAt: -1 })
      .lean<IResearchJob>();
  }

  async function queueResearchDeliveries(
    id: string,
    channels: IDeliveryRecord['channel'][],
    now: Date = new Date(),
  ): Promise<void> {
    for (const channel of new Set(channels)) {
      await ResearchJob().updateOne(
        { id, 'deliveries.channel': { $ne: channel } },
        {
          $push: {
            deliveries: {
              channel,
              state: 'pending',
              attempts: 0,
              nextAttemptAt: now,
              updatedAt: now,
            },
          },
        },
      );
    }
  }

  async function claimResearchDeliveries({
    instanceId,
    leaseMs,
    now = new Date(),
  }: {
    instanceId: string;
    leaseMs: number;
    now?: Date;
  }): Promise<IResearchJob | null> {
    return ResearchJob()
      .findOneAndUpdate(
        {
          status: 'delivered',
          deliveries: { $elemMatch: { state: 'pending', nextAttemptAt: { $lte: now } } },
          $or: [
            { deliveryLeaseUntil: { $exists: false } },
            { deliveryLeaseUntil: null },
            { deliveryLeaseUntil: { $lt: now } },
          ],
        },
        {
          $set: {
            deliveryLeaseUntil: new Date(now.getTime() + leaseMs),
            deliveryLeaseBy: instanceId,
          },
        },
        { new: true },
      )
      .lean<IResearchJob>();
  }

  async function recordResearchDeliveryAttempt(
    id: string,
    channel: IDeliveryRecord['channel'],
    attempt: ResearchDeliveryAttempt,
  ): Promise<void> {
    const set: Record<string, unknown> = {
      'deliveries.$.state': attempt.state,
      'deliveries.$.updatedAt': new Date(),
    };
    const unset: Record<string, 1> = {};
    if (attempt.error) {
      set['deliveries.$.error'] = attempt.error;
    } else {
      unset['deliveries.$.error'] = 1;
    }
    if (attempt.nextAttemptAt) {
      set['deliveries.$.nextAttemptAt'] = attempt.nextAttemptAt;
    } else {
      unset['deliveries.$.nextAttemptAt'] = 1;
    }
    await ResearchJob().updateOne(
      { id, 'deliveries.channel': channel },
      { $set: set, $unset: unset, $inc: { 'deliveries.$.attempts': 1 } },
    );
  }

  async function releaseResearchDeliveryLease(id: string, instanceId: string): Promise<void> {
    await ResearchJob().updateOne(
      { id, deliveryLeaseBy: instanceId },
      { $unset: { deliveryLeaseUntil: 1, deliveryLeaseBy: 1 } },
    );
  }

  async function upsertResearchSchedule(
    input: UpsertResearchScheduleInput,
  ): Promise<IResearchSchedule | null> {
    try {
      return await ResearchSchedule()
        .findOneAndUpdate(
          { scheduleId: input.scheduleId, user: input.user },
          {
            $set: { jobType: input.jobType, channels: [...new Set(input.channels)] },
            $setOnInsert: input.tenantId ? { tenantId: input.tenantId } : {},
          },
          { upsert: true, new: true },
        )
        .lean<IResearchSchedule>();
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        return null;
      }
      throw error;
    }
  }

  async function getResearchSchedule(
    scheduleId: string,
    userId?: UserId,
  ): Promise<IResearchSchedule | null> {
    return ResearchSchedule()
      .findOne({ scheduleId, ...ownerFilter(userId) })
      .lean<IResearchSchedule>();
  }

  async function listResearchSchedules(userId: UserId): Promise<IResearchSchedule[]> {
    return ResearchSchedule()
      .find({ user: userId })
      .sort({ createdAt: 1 })
      .lean<IResearchSchedule[]>();
  }

  async function deleteResearchSchedule(scheduleId: string, userId: UserId): Promise<boolean> {
    const result = await ResearchSchedule().deleteOne({ scheduleId, user: userId });
    return result.deletedCount === 1;
  }

  async function createSnapshot(data: Partial<ISnapshot>): Promise<ISnapshot> {
    const doc = await Snapshot().create(data);
    return doc.toObject();
  }

  async function getSnapshotById(id: string, userId?: UserId): Promise<ISnapshot | null> {
    return Snapshot()
      .findOne({ id, ...visibleSnapshotFilter(userId) })
      .lean<ISnapshot>();
  }

  async function getSnapshotsByIds(ids: string[], userId?: UserId): Promise<ISnapshot[]> {
    if (ids.length === 0) {
      return [];
    }
    return Snapshot()
      .find({ id: { $in: ids }, ...visibleSnapshotFilter(userId) })
      .lean<ISnapshot[]>();
  }

  async function findSnapshotByReference(
    sourceKind: ISnapshot['sourceKind'],
    reference: string,
    userId?: UserId | null,
  ): Promise<ISnapshot | null> {
    return Snapshot()
      .findOne({ sourceKind, reference, user: userId ?? null })
      .lean<ISnapshot>();
  }

  async function archiveSnapshots(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    const result = await Snapshot().updateMany(
      { id: { $in: ids }, archived: { $ne: true } },
      { $set: { archived: true } },
    );
    return result.modifiedCount;
  }

  async function findExpiredSnapshots(before: Date, limit: number): Promise<ISnapshot[]> {
    return Snapshot()
      .find({ archived: { $ne: true }, fetchedAt: { $lt: before } })
      .sort({ fetchedAt: 1 })
      .limit(limit)
      .lean<ISnapshot[]>();
  }

  async function deleteSnapshotsByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    const result = await Snapshot().deleteMany({ id: { $in: ids }, archived: { $ne: true } });
    return result.deletedCount ?? 0;
  }

  return {
    getLastDeliveredResearchJobForSchedule,
    queueResearchDeliveries,
    claimResearchDeliveries,
    recordResearchDeliveryAttempt,
    releaseResearchDeliveryLease,
    upsertResearchSchedule,
    getResearchSchedule,
    listResearchSchedules,
    deleteResearchSchedule,
    ensureResearchIndexes,
    createResearchJob,
    getResearchJobById,
    getResearchJobsByUser,
    getResearchJobByConversation,
    getLiveResearchJobByConversation,
    countActiveResearchJobs,
    claimResearchJob,
    releaseResearchJobLease,
    findResearchJobsPastDraftThreshold,
    findResearchJobsPastDeadline,
    consumeResearchStep,
    reserveResearchDocument,
    releaseResearchDocument,
    addResearchKnownUrls,
    addResearchInputSnapshots,
    appendResearchNotes,
    transitionResearchJob,
    updateResearchJob,
    markResearchBudgetExhausted,
    cancelResearchJob,
    setResearchDelivery,
    getDeliveredResearchJobsForSchedule,
    createSnapshot,
    getSnapshotById,
    getSnapshotsByIds,
    findSnapshotByReference,
    archiveSnapshots,
    findExpiredSnapshots,
    deleteSnapshotsByIds,
  };
}
