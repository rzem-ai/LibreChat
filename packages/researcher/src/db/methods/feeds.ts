import { randomUUID } from 'node:crypto';
import { tenantSafeBulkWrite, createIndexesWithRetry } from '@librechat/data-schemas';
import type { Model, Types, AnyBulkWriteOperation } from 'mongoose';
import type {
  IFeed,
  IFeedItem,
  IFeedDocument,
  IFeedSubscription,
  IFeedItemDocument,
  IFeedSubscriptionDocument,
} from '../types/feeds';
import type { FeedPollStatus, FeedSubscriptionSource } from '../../contract/types';

type UserId = string | Types.ObjectId;

const DUPLICATE_KEY = 11000;

export type FeedSubscriptionWithFeed = IFeedSubscription & { feed?: IFeed };

export type RecordFeedPollInput = {
  ok: boolean;
  status: FeedPollStatus;
  error?: string;
  etag?: string;
  lastModified?: string;
  title?: string;
  siteUrl?: string;
  nextPollAt: Date;
  disableAfterFailures: number;
};

export type FeedMethods = {
  ensureFeedIndexes: () => Promise<void>;
  /** One row per URL (per tenant); a second add returns the existing feed. */
  upsertFeed: (input: { url: string; title?: string }) => Promise<IFeed>;
  getFeedById: (id: string) => Promise<IFeed | null>;
  getFeedsByIds: (ids: string[]) => Promise<IFeed[]>;
  /** True when this created the subscription; counts it on the feed. */
  subscribeToFeed: (
    userId: UserId,
    feedId: string,
    input: { source: FeedSubscriptionSource; label?: string; folder?: string[] },
  ) => Promise<boolean>;
  /** Files one of the user's feeds under a folder path, or unfiles it with null. */
  setFeedSubscriptionFolder: (
    userId: UserId,
    feedId: string,
    folder: string[] | null,
  ) => Promise<boolean>;
  /** Renames a folder path and every folder under it; returns subscriptions changed. */
  renameFeedFolder: (userId: UserId, from: string[], to: string[]) => Promise<number>;
  unsubscribeFromFeed: (userId: UserId, feedId: string) => Promise<boolean>;
  countFeedSubscriptions: (userId: UserId) => Promise<number>;
  getFeedSubscriptions: (userId: UserId) => Promise<FeedSubscriptionWithFeed[]>;
  /** Leases one due, enabled feed with at least one subscriber. */
  claimFeedForPoll: (input: {
    instanceId: string;
    leaseMs: number;
    now?: Date;
  }) => Promise<IFeed | null>;
  /** Stores a poll outcome, counts failures (disabling at the limit) and frees the lease. */
  recordFeedPoll: (feedId: string, instanceId: string, input: RecordFeedPollInput) => Promise<void>;
  setFeedDisabled: (feedId: string, disabled: boolean) => Promise<void>;
  setFeedCatalogue: (
    feedId: string,
    input: { catalogue: boolean; category?: string },
  ) => Promise<IFeed | null>;
  listCatalogueFeeds: () => Promise<IFeed[]>;
  /** Null when the feed already holds this guid. */
  insertFeedItem: (item: Omit<IFeedItem, 'archived'>) => Promise<IFeedItem | null>;
  findKnownFeedGuids: (feedId: string, guids: string[]) => Promise<string[]>;
  getFeedItems: (input: { feedIds: string[]; since?: Date; limit: number }) => Promise<IFeedItem[]>;
  archiveFeedItemsBySnapshot: (snapshotIds: string[]) => Promise<number>;
  deleteExpiredFeedItems: (before: Date) => Promise<number>;
};

function isDuplicate(error: unknown): boolean {
  return (error as { code?: number })?.code === DUPLICATE_KEY;
}

export function createFeedMethods(mongoose: typeof import('mongoose')): FeedMethods {
  const Feed = () => mongoose.models.Feed as Model<IFeedDocument>;
  const Subscription = () => mongoose.models.FeedSubscription as Model<IFeedSubscriptionDocument>;
  const Item = () => mongoose.models.FeedItem as Model<IFeedItemDocument>;

  async function ensureFeedIndexes(): Promise<void> {
    await createIndexesWithRetry(Feed());
    await createIndexesWithRetry(Subscription());
    await createIndexesWithRetry(Item());
  }

  async function upsertFeed({ url, title }: { url: string; title?: string }): Promise<IFeed> {
    const feed = await Feed()
      .findOneAndUpdate(
        { url },
        {
          $setOnInsert: {
            id: `feed_${randomUUID()}`,
            url,
            ...(title ? { title } : {}),
            consecutiveFailures: 0,
            disabled: false,
            subscriberCount: 0,
            catalogue: false,
          },
        },
        { upsert: true, new: true },
      )
      .lean<IFeed>();
    return feed as IFeed;
  }

  async function getFeedById(id: string): Promise<IFeed | null> {
    return Feed().findOne({ id }).lean<IFeed>();
  }

  async function getFeedsByIds(ids: string[]): Promise<IFeed[]> {
    return ids.length === 0
      ? []
      : Feed()
          .find({ id: { $in: ids } })
          .lean<IFeed[]>();
  }

  async function subscribeToFeed(
    userId: UserId,
    feedId: string,
    input: { source: FeedSubscriptionSource; label?: string; folder?: string[] },
  ): Promise<boolean> {
    try {
      await Subscription().create({
        user: userId,
        feedId,
        source: input.source,
        ...(input.label ? { label: input.label } : {}),
        ...(input.folder?.length ? { folder: input.folder } : {}),
      });
    } catch (error) {
      if (isDuplicate(error)) {
        return false;
      }
      throw error;
    }
    await Feed().updateOne({ id: feedId }, { $inc: { subscriberCount: 1 } });
    return true;
  }

  async function setFeedSubscriptionFolder(
    userId: UserId,
    feedId: string,
    folder: string[] | null,
  ): Promise<boolean> {
    const result = await Subscription().updateOne(
      { user: userId, feedId },
      folder?.length ? { $set: { folder } } : { $unset: { folder: 1 } },
    );
    return result.matchedCount === 1;
  }

  async function renameFeedFolder(userId: UserId, from: string[], to: string[]): Promise<number> {
    if (from.length === 0) {
      return 0;
    }
    const prefix = Object.fromEntries(from.map((segment, index) => [`folder.${index}`, segment]));
    const affected = await Subscription()
      .find({ user: userId, ...prefix }, { _id: 1, folder: 1 })
      .lean<Array<Pick<IFeedSubscription, '_id' | 'folder'>>>();
    if (affected.length === 0) {
      return 0;
    }
    await tenantSafeBulkWrite(
      Subscription(),
      affected.map((sub): AnyBulkWriteOperation => {
        const folder = [...to, ...(sub.folder ?? []).slice(from.length)];
        return {
          updateOne: {
            filter: { _id: sub._id },
            update: folder.length ? { $set: { folder } } : { $unset: { folder: 1 } },
          },
        };
      }),
    );
    return affected.length;
  }

  async function unsubscribeFromFeed(userId: UserId, feedId: string): Promise<boolean> {
    const removed = await Subscription().deleteOne({ user: userId, feedId });
    if (removed.deletedCount === 0) {
      return false;
    }
    await Feed().updateOne(
      { id: feedId, subscriberCount: { $gt: 0 } },
      { $inc: { subscriberCount: -1 } },
    );
    return true;
  }

  async function countFeedSubscriptions(userId: UserId): Promise<number> {
    return Subscription().countDocuments({ user: userId });
  }

  async function getFeedSubscriptions(userId: UserId): Promise<FeedSubscriptionWithFeed[]> {
    const subscriptions = await Subscription()
      .find({ user: userId })
      .sort({ createdAt: 1 })
      .lean<IFeedSubscription[]>();
    const feeds = await getFeedsByIds(subscriptions.map((s) => s.feedId));
    const byId = new Map(feeds.map((feed) => [feed.id, feed]));
    return subscriptions.map((subscription) => ({
      ...subscription,
      feed: byId.get(subscription.feedId),
    }));
  }

  async function claimFeedForPoll({
    instanceId,
    leaseMs,
    now = new Date(),
  }: {
    instanceId: string;
    leaseMs: number;
    now?: Date;
  }): Promise<IFeed | null> {
    return Feed()
      .findOneAndUpdate(
        {
          disabled: { $ne: true },
          subscriberCount: { $gt: 0 },
          $and: [
            {
              $or: [
                { nextPollAt: { $exists: false } },
                { nextPollAt: null },
                { nextPollAt: { $lte: now } },
              ],
            },
            {
              $or: [
                { leaseUntil: { $exists: false } },
                { leaseUntil: null },
                { leaseUntil: { $lt: now } },
              ],
            },
          ],
        },
        { $set: { leaseUntil: new Date(now.getTime() + leaseMs), leaseBy: instanceId } },
        { new: true, sort: { nextPollAt: 1 } },
      )
      .lean<IFeed>();
  }

  async function recordFeedPoll(
    feedId: string,
    instanceId: string,
    input: RecordFeedPollInput,
  ): Promise<void> {
    const common = {
      lastPolledAt: new Date(),
      lastStatus: input.status,
      nextPollAt: input.nextPollAt,
    };
    if (input.ok) {
      await Feed().updateOne(
        { id: feedId },
        {
          $set: {
            ...common,
            consecutiveFailures: 0,
            ...(input.etag ? { etag: input.etag } : {}),
            ...(input.lastModified ? { lastModified: input.lastModified } : {}),
            ...(input.title ? { title: input.title } : {}),
            ...(input.siteUrl ? { siteUrl: input.siteUrl } : {}),
          },
          $unset: { lastError: 1 },
        },
      );
    } else {
      const updated = await Feed()
        .findOneAndUpdate(
          { id: feedId },
          {
            $set: { ...common, ...(input.error ? { lastError: input.error } : {}) },
            $inc: { consecutiveFailures: 1 },
          },
          { new: true, projection: { consecutiveFailures: 1 } },
        )
        .lean<Pick<IFeed, 'consecutiveFailures'>>();
      if ((updated?.consecutiveFailures ?? 0) >= input.disableAfterFailures) {
        await Feed().updateOne({ id: feedId }, { $set: { disabled: true } });
      }
    }
    await Feed().updateOne(
      { id: feedId, leaseBy: instanceId },
      { $unset: { leaseUntil: 1, leaseBy: 1 } },
    );
  }

  async function setFeedDisabled(feedId: string, disabled: boolean): Promise<void> {
    await Feed().updateOne(
      { id: feedId },
      disabled
        ? { $set: { disabled: true } }
        : { $set: { disabled: false, consecutiveFailures: 0 } },
    );
  }

  async function setFeedCatalogue(
    feedId: string,
    input: { catalogue: boolean; category?: string },
  ): Promise<IFeed | null> {
    return Feed()
      .findOneAndUpdate(
        { id: feedId },
        input.catalogue
          ? { $set: { catalogue: true, catalogueCategory: input.category ?? 'General' } }
          : { $set: { catalogue: false }, $unset: { catalogueCategory: 1 } },
        { new: true },
      )
      .lean<IFeed>();
  }

  async function listCatalogueFeeds(): Promise<IFeed[]> {
    return Feed()
      .find({ catalogue: true })
      .sort({ catalogueCategory: 1, title: 1 })
      .lean<IFeed[]>();
  }

  async function insertFeedItem(item: Omit<IFeedItem, 'archived'>): Promise<IFeedItem | null> {
    try {
      const doc = await Item().create({ ...item, archived: false });
      return doc.toObject();
    } catch (error) {
      if (isDuplicate(error)) {
        return null;
      }
      throw error;
    }
  }

  async function findKnownFeedGuids(feedId: string, guids: string[]): Promise<string[]> {
    if (guids.length === 0) {
      return [];
    }
    const known = await Item()
      .find({ feedId, guid: { $in: guids } }, { guid: 1 })
      .lean<Array<Pick<IFeedItem, 'guid'>>>();
    const set = new Set(known.map((item) => item.guid));
    return guids.filter((guid) => set.has(guid));
  }

  async function getFeedItems({
    feedIds,
    since,
    limit,
  }: {
    feedIds: string[];
    since?: Date;
    limit: number;
  }): Promise<IFeedItem[]> {
    if (feedIds.length === 0) {
      return [];
    }
    return Item()
      .find({ feedId: { $in: feedIds }, ...(since ? { publishedAt: { $gte: since } } : {}) })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean<IFeedItem[]>();
  }

  async function archiveFeedItemsBySnapshot(snapshotIds: string[]): Promise<number> {
    if (snapshotIds.length === 0) {
      return 0;
    }
    const result = await Item().updateMany(
      { snapshotId: { $in: snapshotIds }, archived: { $ne: true } },
      { $set: { archived: true } },
    );
    return result.modifiedCount;
  }

  async function deleteExpiredFeedItems(before: Date): Promise<number> {
    const result = await Item().deleteMany({
      archived: { $ne: true },
      publishedAt: { $lt: before },
    });
    return result.deletedCount ?? 0;
  }

  return {
    ensureFeedIndexes,
    upsertFeed,
    getFeedById,
    getFeedsByIds,
    subscribeToFeed,
    unsubscribeFromFeed,
    setFeedSubscriptionFolder,
    renameFeedFolder,
    countFeedSubscriptions,
    getFeedSubscriptions,
    claimFeedForPoll,
    recordFeedPoll,
    setFeedDisabled,
    setFeedCatalogue,
    listCatalogueFeeds,
    insertFeedItem,
    findKnownFeedGuids,
    getFeedItems,
    archiveFeedItemsBySnapshot,
    deleteExpiredFeedItems,
  };
}
