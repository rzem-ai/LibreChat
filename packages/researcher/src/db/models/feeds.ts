import { Model } from 'mongoose';
import type { IFeedDocument, IFeedItemDocument, IFeedSubscriptionDocument } from '../types/feeds';
import { feedSchema, feedItemSchema, feedSubscriptionSchema } from '../schema/feed';
import { applyTenantIsolation } from './tenant';

export function createFeedModel(mongoose: typeof import('mongoose')): Model<IFeedDocument> {
  applyTenantIsolation(feedSchema);
  return mongoose.models.Feed || mongoose.model<IFeedDocument>('Feed', feedSchema);
}

export function createFeedSubscriptionModel(
  mongoose: typeof import('mongoose'),
): Model<IFeedSubscriptionDocument> {
  applyTenantIsolation(feedSubscriptionSchema);
  return (
    mongoose.models.FeedSubscription ||
    mongoose.model<IFeedSubscriptionDocument>('FeedSubscription', feedSubscriptionSchema)
  );
}

export function createFeedItemModel(mongoose: typeof import('mongoose')): Model<IFeedItemDocument> {
  applyTenantIsolation(feedItemSchema);
  return mongoose.models.FeedItem || mongoose.model<IFeedItemDocument>('FeedItem', feedItemSchema);
}
