import { logger } from '@librechat/data-schemas';
import type { DeleteSkillResult, ISkillFile } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

export interface CascadeDeleteSkillDeps {
  getSkillById: (id: string) => Promise<{ author: Types.ObjectId } | null>;
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
 * rows, permissions). Scoped to `(skillId, authorId)` so a claimed sweep
 * candidate can never cascade a skill it doesn't actually own — the same
 * defense-in-depth the renewal path applies. Blob deletions run in parallel
 * and each is isolated, mirroring the manual-delete handler's tolerance for
 * partial storage-cleanup failure.
 */
export async function cascadeDeleteSkill(
  skillId: string,
  authorId: string,
  deps: CascadeDeleteSkillDeps,
): Promise<CascadeDeleteSkillResult | null> {
  const skill = await deps.getSkillById(skillId);
  if (!skill || skill.author.toString() !== authorId) {
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

  const result = await deps.deleteSkill(skillId);
  return { ...result, failedBlobDeletions };
}
