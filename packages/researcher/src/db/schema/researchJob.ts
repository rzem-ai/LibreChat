import { Schema } from 'mongoose';
import type { IResearchJobDocument } from '../types/research';
import {
  citationStates,
  deliveryStates,
  ResearchJobType,
  researchJobStatuses,
  researchInvocationModes,
  researchDeliveryChannels,
} from '../../contract/types';

const noteSchema = new Schema(
  {
    claim: { type: String, required: true },
    snapshotId: { type: String, required: true },
    locator: { type: String },
  },
  { _id: false },
);

const citationSchema = new Schema(
  {
    claim: { type: String, required: true },
    snapshotId: { type: String, required: true },
    locator: { type: String },
    state: { type: String, enum: citationStates, required: true },
  },
  { _id: false },
);

const deliverySchema = new Schema(
  {
    channel: { type: String, enum: researchDeliveryChannels, required: true },
    state: { type: String, enum: deliveryStates, required: true },
    error: { type: String },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date },
    updatedAt: { type: Date },
  },
  { _id: false },
);

const researchJobSchema: Schema<IResearchJobDocument> = new Schema(
  {
    id: { type: String, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: String, index: true },
    agentId: { type: String, required: true },
    jobType: { type: String, enum: Object.values(ResearchJobType), required: true },
    invocationMode: {
      type: String,
      enum: researchInvocationModes,
      required: true,
      default: 'interactive',
    },
    status: { type: String, enum: researchJobStatuses, required: true, default: 'submitted' },
    partial: { type: Boolean, default: false },
    prompt: { type: String, required: true, maxlength: 32000 },
    brief: { type: String },
    draft: { type: String },
    notes: { type: [noteSchema], default: undefined },
    budget: {
      wallClockMinutes: { type: Number, required: true },
      maxSteps: { type: Number, required: true },
    },
    budgetUsed: {
      elapsedMs: { type: Number, default: 0 },
      steps: { type: Number, default: 0 },
    },
    conversationId: { type: String, required: true, index: true },
    parentMessageId: { type: String },
    inputSnapshotIds: { type: [String], default: [] },
    uploadFileIds: { type: [String], default: [] },
    documentReferences: { type: [String], default: [] },
    documentsRead: { type: Number, default: 0 },
    knownUrlHashes: { type: [String], default: [] },
    reportFileId: { type: String },
    citedSnapshotIds: { type: [String], default: [] },
    verification: {
      type: new Schema(
        {
          supported: { type: Number, required: true },
          unsupported: { type: Number, required: true },
          unavailable: { type: Number, required: true },
          total: { type: Number, required: true },
          scopeNotes: { type: String },
          uncited: { type: Number },
        },
        { _id: false },
      ),
      default: undefined,
    },
    citations: { type: [citationSchema], default: undefined },
    deliveries: { type: [deliverySchema], default: [] },
    scheduleId: { type: String },
    deliveryLeaseUntil: { type: Date },
    deliveryLeaseBy: { type: String },
    reportSnapshotId: { type: String },
    feedsSince: { type: Date },
    failureReason: { type: String },
    cancelRequested: { type: Boolean },
    phaseDeliveryKey: { type: String },
    draftAt: { type: Date },
    deadlineAt: { type: Date },
    budgetExhaustedAt: { type: Date },
    verificationAttempts: { type: Number, default: 0 },
    leaseUntil: { type: Date },
    leaseBy: { type: String },
    startedAt: { type: Date },
    phaseStartedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

researchJobSchema.index({ id: 1, tenantId: 1 }, { unique: true });
researchJobSchema.index({ user: 1, status: 1 });
researchJobSchema.index({ user: 1, createdAt: -1 });
researchJobSchema.index({ scheduleId: 1, status: 1, completedAt: -1 });
researchJobSchema.index(
  { 'deliveries.state': 1, 'deliveries.nextAttemptAt': 1 },
  { partialFilterExpression: { 'deliveries.state': 'pending' } },
);
researchJobSchema.index({ conversationId: 1, user: 1, status: 1 });
researchJobSchema.index({ status: 1, draftAt: 1 });
researchJobSchema.index({ status: 1, deadlineAt: 1 });

export default researchJobSchema;
