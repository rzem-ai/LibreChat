import type { AllMethods } from '@librechat/data-schemas';
import type { Model } from 'mongoose';
import type {
  IResearchJobDocument,
  IResearchScheduleDocument,
  ISnapshotDocument,
} from './types/research';
import type { IFeedDocument, IFeedItemDocument, IFeedSubscriptionDocument } from './types/feeds';
import type { ResearchMethods } from './methods/research';
import type { FeedMethods } from './methods/feeds';
import {
  createResearchJobModel,
  createResearchScheduleModel,
  createSnapshotModel,
} from './models/research';
import { createFeedModel, createFeedItemModel, createFeedSubscriptionModel } from './models/feeds';
import { createResearchMethods } from './methods/research';
import { createFeedMethods } from './methods/feeds';

export * from './types/research';
export * from './types/feeds';
export * from './methods/research';
export * from './methods/feeds';

export type ResearchModels = {
  ResearchJob: Model<IResearchJobDocument>;
  ResearchSchedule: Model<IResearchScheduleDocument>;
  Snapshot: Model<ISnapshotDocument>;
  Feed: Model<IFeedDocument>;
  FeedSubscription: Model<IFeedSubscriptionDocument>;
  FeedItem: Model<IFeedItemDocument>;
};

/** Database methods owned by the research package. */
export type ResearchDbMethods = ResearchMethods & FeedMethods;

/** What the research host reads: the app's core methods plus the research ones. */
export type ResearchHostMethods = AllMethods & ResearchDbMethods;

/**
 * Registers the research models on the app's mongoose connection, the way the core
 * `createModels(mongoose)` does. Call it at boot, before the research methods run.
 */
export function createResearchModels(mongoose: typeof import('mongoose')): ResearchModels {
  return {
    ResearchJob: createResearchJobModel(mongoose),
    ResearchSchedule: createResearchScheduleModel(mongoose),
    Snapshot: createSnapshotModel(mongoose),
    Feed: createFeedModel(mongoose),
    FeedSubscription: createFeedSubscriptionModel(mongoose),
    FeedItem: createFeedItemModel(mongoose),
  };
}

/** The research database methods over the models `createResearchModels` registered. */
export function createResearchDbMethods(mongoose: typeof import('mongoose')): ResearchDbMethods {
  return { ...createResearchMethods(mongoose), ...createFeedMethods(mongoose) };
}
