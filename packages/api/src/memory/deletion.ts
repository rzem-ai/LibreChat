import type { Types } from 'mongoose';

export interface DeleteClaimedMemoryDeps {
  confirmMemoryPurgeEligible: (
    memoryId: string,
    purgeClaimId: string,
    now: Date,
  ) => Promise<{ _id: Types.ObjectId } | null>;
  deleteMemoryById: (memoryId: string, userId: string) => Promise<unknown>;
}

/**
 * Deletes a purge-sweep-claimed memory. Unlike `cascadeDeleteAgent`/`cascadeDeleteSkill`,
 * a `MemoryEntry.value` is a plain string, not a file/blob reference, so there is no
 * child-resource cleanup step and nothing actually cascades — this is a fence-check
 * (re-confirming expiry and claim ownership immediately before the delete, closing the
 * claim→delete TOCTOU window) followed by a single document delete.
 */
export async function deleteClaimedMemory(
  memoryId: string,
  scope: { purgeClaimId: string; userId: string },
  deps: DeleteClaimedMemoryDeps,
): Promise<boolean> {
  const confirmed = await deps.confirmMemoryPurgeEligible(memoryId, scope.purgeClaimId, new Date());
  if (!confirmed) {
    return false;
  }
  await deps.deleteMemoryById(memoryId, scope.userId);
  return true;
}
