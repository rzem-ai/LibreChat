import { Schema } from 'mongoose';
import type { IMemoryEntry } from '~/types/memory';

const MEMORY_KEY_REGEX = /^[a-z_]+$/;

export function isValidMemoryKey(key: string): boolean {
  return MEMORY_KEY_REGEX.test(key);
}

const MemoryEntrySchema: Schema<IMemoryEntry> = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  key: {
    type: String,
    required: true,
    validate: {
      validator: isValidMemoryKey,
      message: 'Key must only contain lowercase letters and underscores',
    },
  },
  value: {
    type: String,
    required: true,
  },
  /** Agent partition; null/absent = shared personal pool */
  agentId: {
    type: String,
    default: undefined,
  },
  tokenCount: {
    type: Number,
    default: 0,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
  tenantId: {
    type: String,
    index: true,
  },
  /** Explicit activity anchor for retention; never inferred from `updated_at`. */
  lastActivityAt: {
    type: Date,
  },
  expiredAt: {
    type: Date,
  },
  /** Lease holder for the in-flight purge sweep claiming this memory, so two
   * sweep ticks (or replicas) never delete the same expired memory twice. */
  purgeClaimId: {
    type: String,
  },
  purgeClaimedAt: {
    type: Date,
  },
  purgeAttempts: {
    type: Number,
    default: 0,
  },
  /** Earliest time a sweep tick may claim this memory again, set on release to
   * back off a failed attempt or to let an expired lease be reclaimed. */
  purgeNotBefore: {
    type: Date,
  },
});

MemoryEntrySchema.index({ userId: 1, agentId: 1, key: 1 });
MemoryEntrySchema.index({ expiredAt: 1, purgeNotBefore: 1 });

export default MemoryEntrySchema;
