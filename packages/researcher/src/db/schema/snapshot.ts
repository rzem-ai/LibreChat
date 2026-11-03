import { Schema } from 'mongoose';
import type { ISnapshotDocument } from '../types/research';
import { snapshotSourceKinds } from '../../contract/types';

const snapshotSchema: Schema<ISnapshotDocument> = new Schema(
  {
    id: { type: String, required: true, index: true },
    /** Null for shared feed items. */
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    tenantId: { type: String, index: true },
    sourceKind: { type: String, enum: snapshotSourceKinds, required: true },
    reference: { type: String, required: true },
    title: { type: String },
    url: { type: String },
    feedId: { type: String },
    storageKey: { type: String, required: true },
    fileStrategy: { type: String, required: true },
    contentHash: { type: String, required: true },
    bytes: { type: Number },
    fetchedAt: { type: Date, required: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

snapshotSchema.index({ id: 1, tenantId: 1 }, { unique: true });
snapshotSchema.index({ user: 1, fetchedAt: -1 });
snapshotSchema.index({ archived: 1, fetchedAt: 1 });
snapshotSchema.index({ feedId: 1, reference: 1 });

export default snapshotSchema;
