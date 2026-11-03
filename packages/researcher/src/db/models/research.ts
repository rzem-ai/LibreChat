import { Model } from 'mongoose';
import type {
  ISnapshotDocument,
  IResearchJobDocument,
  IResearchScheduleDocument,
} from '../types/research';
import researchScheduleSchema from '../schema/researchSchedule';
import researchJobSchema from '../schema/researchJob';
import snapshotSchema from '../schema/snapshot';
import { applyTenantIsolation } from './tenant';

export function createResearchJobModel(
  mongoose: typeof import('mongoose'),
): Model<IResearchJobDocument> {
  applyTenantIsolation(researchJobSchema);
  return (
    mongoose.models.ResearchJob ||
    mongoose.model<IResearchJobDocument>('ResearchJob', researchJobSchema)
  );
}

export function createSnapshotModel(mongoose: typeof import('mongoose')): Model<ISnapshotDocument> {
  applyTenantIsolation(snapshotSchema);
  return mongoose.models.Snapshot || mongoose.model<ISnapshotDocument>('Snapshot', snapshotSchema);
}

export function createResearchScheduleModel(
  mongoose: typeof import('mongoose'),
): Model<IResearchScheduleDocument> {
  applyTenantIsolation(researchScheduleSchema);
  return (
    mongoose.models.ResearchSchedule ||
    mongoose.model<IResearchScheduleDocument>('ResearchSchedule', researchScheduleSchema)
  );
}
