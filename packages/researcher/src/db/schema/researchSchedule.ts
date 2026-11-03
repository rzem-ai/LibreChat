import { Schema } from 'mongoose';
import type { IResearchScheduleDocument } from '../types/research';
import { ResearchJobType, researchDeliveryChannels } from '../../contract/types';

const researchScheduleSchema: Schema<IResearchScheduleDocument> = new Schema(
  {
    scheduleId: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: String, index: true },
    jobType: { type: String, enum: Object.values(ResearchJobType), required: true },
    channels: {
      type: [{ type: String, enum: researchDeliveryChannels }],
      default: ['conversation'],
    },
  },
  { timestamps: true },
);

researchScheduleSchema.index({ scheduleId: 1, tenantId: 1 }, { unique: true });

export default researchScheduleSchema;
