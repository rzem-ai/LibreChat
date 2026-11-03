import type { Document, Types } from 'mongoose';
import type { FeedPollStatus, FeedSubscriptionSource } from '../../contract/types';

/** A feed URL polled once for all its subscribers (design 5.6). */
export interface IFeed {
  _id?: Types.ObjectId;
  id: string;
  tenantId?: string;
  url: string;
  title?: string;
  siteUrl?: string;
  etag?: string;
  lastModified?: string;
  lastPolledAt?: Date;
  nextPollAt?: Date;
  lastStatus?: FeedPollStatus;
  lastError?: string;
  consecutiveFailures: number;
  disabled: boolean;
  subscriberCount: number;
  catalogue: boolean;
  catalogueCategory?: string;
  leaseUntil?: Date;
  leaseBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFeedDocument extends Omit<IFeed, 'id' | '_id'>, Document {
  id: string;
}

export interface IFeedSubscription {
  _id?: Types.ObjectId;
  user: Types.ObjectId;
  tenantId?: string;
  feedId: string;
  label?: string;
  /** Folder path segments, outermost first; absent for an unfiled feed. */
  folder?: string[];
  source: FeedSubscriptionSource;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFeedSubscriptionDocument extends Omit<IFeedSubscription, '_id'>, Document {}

export interface IFeedItem {
  _id?: Types.ObjectId;
  tenantId?: string;
  feedId: string;
  guid: string;
  link?: string;
  title?: string;
  publishedAt: Date;
  /** Shared (ownerless) snapshot of the item content. */
  snapshotId: string;
  archived: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFeedItemDocument extends Omit<IFeedItem, '_id'>, Document {}
