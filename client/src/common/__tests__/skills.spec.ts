import type { TSkillSummary } from 'librechat-data-provider';
import { resolveSkillGroup } from '../skills';

const makeSkill = (
  overrides: Partial<Pick<TSkillSummary, 'isPublic' | 'author' | 'authorName'>>,
): Pick<TSkillSummary, 'isPublic' | 'author' | 'authorName'> => ({
  author: 'user-1',
  authorName: 'Author One',
  ...overrides,
});

describe('resolveSkillGroup', () => {
  it('returns public when isPublic is true, regardless of authorship', () => {
    expect(resolveSkillGroup(makeSkill({ isPublic: true, author: 'user-1' }), 'user-1')).toBe(
      'public',
    );
  });

  it('public wins over shared when a skill is both public and authored by someone else', () => {
    expect(
      resolveSkillGroup(
        makeSkill({ isPublic: true, author: 'other-user', authorName: 'Other' }),
        'user-1',
      ),
    ).toBe('public');
  });

  it('returns shared when authored by someone else with an authorName and not public', () => {
    expect(
      resolveSkillGroup(
        makeSkill({ isPublic: false, author: 'other-user', authorName: 'Other' }),
        'user-1',
      ),
    ).toBe('shared');
  });

  it('returns mine when owned by the current user', () => {
    expect(resolveSkillGroup(makeSkill({ isPublic: false, author: 'user-1' }), 'user-1')).toBe(
      'mine',
    );
  });

  it('returns mine when authored by someone else but with no authorName', () => {
    expect(
      resolveSkillGroup(
        makeSkill({ isPublic: false, author: 'other-user', authorName: '' }),
        'user-1',
      ),
    ).toBe('mine');
  });

  it('cannot resolve ownership when currentUserId is nullish, so falls to shared', () => {
    expect(resolveSkillGroup(makeSkill({ isPublic: false, author: 'user-1' }), undefined)).toBe(
      'shared',
    );
  });
});
