import { Schema } from 'mongoose';
import type { IFeedDocument, IFeedItemDocument, IFeedSubscriptionDocument } from '../types/feeds';

export const feedSchema: Schema<IFeedDocument> = new Schema(
  {
    id: { type: String, required: true, index: true },
    tenantId: { type: String, index: true },
    url: { type: String, required: true, maxlength: 2048 },
    title: { type: String, maxlength: 512 },
    siteUrl: { type: String, maxlength: 2048 },
    etag: { type: String, maxlength: 512 },
    lastModified: { type: String, maxlength: 128 },
    lastPolledAt: { type: Date },
    nextPollAt: { type: Date },
    lastStatus: { type: String, enum: ['ok', 'not_modified', 'error'] },
    lastError: { type: String, maxlength: 64 },
    consecutiveFailures: { type: Number, default: 0 },
    disabled: { type: Boolean, default: false },
    subscriberCount: { type: Number, default: 0 },
    catalogue: { type: Boolean, default: false },
    catalogueCategory: { type: String, maxlength: 128 },
    leaseUntil: { type: Date },
    leaseBy: { type: String },
  },
  { timestamps: true },
);

feedSchema.index({ id: 1, tenantId: 1 }, { unique: true });
feedSchema.index({ url: 1, tenantId: 1 }, { unique: true });
feedSchema.index({ disabled: 1, subscriberCount: 1, nextPollAt: 1 });
feedSchema.index({ catalogue: 1, catalogueCategory: 1 });

export const feedSubscriptionSchema: Schema<IFeedSubscriptionDocument> = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenantId: { type: String, index: true },
    feedId: { type: String, required: true, index: true },
    label: { type: String, maxlength: 512 },
    /** Folder path segments, outermost first; absent for an unfiled feed. */
    folder: { type: [{ type: String, maxlength: 128 }], default: undefined },
    source: { type: String, enum: ['opml', 'catalogue', 'manual'], required: true },
  },
  { timestamps: true },
);

feedSubscriptionSchema.index({ user: 1, feedId: 1, tenantId: 1 }, { unique: true });

export const feedItemSchema: Schema<IFeedItemDocument> = new Schema(
  {
    tenantId: { type: String, index: true },
    feedId: { type: String, required: true },
    guid: { type: String, required: true, maxlength: 2048 },
    link: { type: String, maxlength: 2048 },
    title: { type: String, maxlength: 1024 },
    publishedAt: { type: Date, required: true },
    snapshotId: { type: String, required: true, index: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

feedItemSchema.index({ feedId: 1, guid: 1, tenantId: 1 }, { unique: true });
feedItemSchema.index({ feedId: 1, publishedAt: -1 });
feedItemSchema.index({ archived: 1, publishedAt: 1 });
