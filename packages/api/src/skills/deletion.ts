// Deloitte Custom Change: Retention Update
import { logger } from '@librechat/data-schemas';
import type { DeleteSkillResult, ISkillFile } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

export interface CascadeDeleteSkillDeps {
  getSkillById: (id: string) => Promise<{ author: Types.ObjectId } | null>;
  /** Scoped re-check used when `scope.claimToken` is set (purge-sweep callers only). */
  confirmSkillPurgeEligible?: (
    skillId: string,
    claimToken: string,
    now: Date,
  ) => Promise<{ author: Types.ObjectId } | null>;
  listSkillFiles: (skillId: string) => Promise<Array<ISkillFile & { _id: Types.ObjectId }>>;
  deleteSkillFileBlob: (file: ISkillFile) => Promise<void>;
  deleteSkill: (id: string) => Promise<DeleteSkillResult>;
}

export type CascadeDeleteSkillResult = DeleteSkillResult & {
  failedBlobDeletions: string[];
};

/**
 * Deletes a skill's backing file blobs, then the skill document and its
 * metadata via the existing `deleteSkill` cleanup (allowlists, `SkillFile`
 * rows, permissions). Scoped to `(skillId, scope.authorId)` so a claimed
 * sweep candidate can never cascade a skill it doesn't actually own — the
 * same defense-in-depth the renewal path applies.
 *
 * `scope.claimToken`, when set (purge-sweep callers), re-checks expiry,
 * exemption, and claim ownership immediately before cascading via
 * `deps.confirmSkillPurgeEligible` — a renewal or exemption granted after
 * the sweep claimed the skill aborts the cascade instead of deleting it.
 *
 * Blob deletions run in parallel and each is isolated; if any fails, the
 * skill document is left in place (not deleted) so the purge claim can be
 * released for retry instead of silently orphaning blobs.
 */
export async function cascadeDeleteSkill(
  skillId: string,
  scope: { authorId: string; claimToken?: string },
  deps: CascadeDeleteSkillDeps,
): Promise<CascadeDeleteSkillResult | null> {
  const skill = scope.claimToken
    ? await deps.confirmSkillPurgeEligible?.(skillId, scope.claimToken, new Date())
    : await deps.getSkillById(skillId);
  if (!skill || skill.author.toString() !== scope.authorId) {
    return null;
  }

  const files = await deps.listSkillFiles(skillId);
  const failedBlobDeletions: string[] = [];
  const blobResults = await Promise.allSettled(files.map((file) => deps.deleteSkillFileBlob(file)));
  for (const [index, blobResult] of blobResults.entries()) {
    if (blobResult.status === 'rejected') {
      failedBlobDeletions.push(files[index].file_id);
      logger.error(
        `[cascadeDeleteSkill] Blob cleanup failed for skill ${skillId} file ${files[index].relativePath}:`,
        blobResult.reason,
      );
    }
  }

  if (failedBlobDeletions.length > 0) {
    throw new Error(
      `[cascadeDeleteSkill] Aborting deletion of skill ${skillId} after ${failedBlobDeletions.length} blob cleanup failure(s)`,
    );
  }

  const result = await deps.deleteSkill(skillId);
  return { ...result, failedBlobDeletions };
}
