import type { TSkillSummary } from 'librechat-data-provider';

export type SkillGroup = 'public' | 'shared' | 'mine';

/**
 * Deloitte Custom Change: Shared skill grouping logic for the skills library
 * and agent-builder picker.
 *
 * A skill that is both public and authored by someone else still counts as
 * Public — "Public" is about discoverability/provenance (came from the open
 * catalog), "Shared" is strictly for privately-shared, non-public skills.
 */
export function resolveSkillGroup(
  skill: Pick<TSkillSummary, 'isPublic' | 'author' | 'authorName'>,
  currentUserId: string | null | undefined,
): SkillGroup {
  if (skill.isPublic === true) {
    return 'public';
  }

  if (currentUserId == null) {
    return 'shared';
  }

  return skill.author === currentUserId ? 'mine' : 'shared';
}
