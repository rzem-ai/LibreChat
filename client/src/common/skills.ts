import type { TSkillSummary } from 'librechat-data-provider';

export type SkillGroup = 'public' | 'shared' | 'mine';

/**
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
  const ownedByUser = currentUserId != null && skill.author === currentUserId;
  if (!ownedByUser && Boolean(skill.authorName)) {
    return 'shared';
  }
  return 'mine';
}
