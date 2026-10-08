import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TSkillSummary } from 'librechat-data-provider';
import SkillList from '../SkillList';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams()],
}));

/* SkillListItem pulls in react-vtree (ESM-only) for its inline file tree —
   irrelevant to SkillList's grouping/section logic under test here, and not
   resolvable under Jest's CJS transform. */
jest.mock('../SkillListItem', () => ({
  __esModule: true,
  default: ({ skill }: { skill: TSkillSummary }) => <div>{skill.name}</div>,
}));

const makeSkill = (overrides: Partial<TSkillSummary>): TSkillSummary => ({
  _id: overrides.name ?? 'id',
  name: 'skill',
  description: 'description',
  author: 'user-1',
  authorName: 'User One',
  version: 1,
  source: 'inline',
  fileCount: 0,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('SkillList', () => {
  it('shows the empty-catalog message when there are no skills at all', () => {
    render(<SkillList skills={[]} sectionOpen={true} onSectionOpenChange={jest.fn()} />);
    expect(screen.getByText('com_ui_skills_empty')).toBeInTheDocument();
  });

  it('groups skills into Public, Shared, and Mine sections', () => {
    const skills = [
      makeSkill({ name: 'public-skill', isPublic: true, author: 'other-user' }),
      makeSkill({ name: 'shared-skill', author: 'other-user', authorName: 'Other' }),
      makeSkill({ name: 'my-skill', author: 'user-1' }),
    ];

    render(<SkillList skills={skills} sectionOpen={true} onSectionOpenChange={jest.fn()} />);

    expect(screen.getByText('com_ui_skills_view_public')).toBeInTheDocument();
    expect(screen.getByText('com_ui_skills_view_shared')).toBeInTheDocument();
    expect(screen.getByText('com_ui_skills_view_mine')).toBeInTheDocument();
    expect(screen.getByText('public-skill')).toBeInTheDocument();
    expect(screen.getByText('shared-skill')).toBeInTheDocument();
    expect(screen.getByText('my-skill')).toBeInTheDocument();
  });

  it('hides a section entirely when it has no matching skills', () => {
    const skills = [makeSkill({ name: 'my-skill', author: 'user-1' })];

    render(<SkillList skills={skills} sectionOpen={true} onSectionOpenChange={jest.fn()} />);

    expect(screen.queryByText('com_ui_skills_view_public')).toBeNull();
    expect(screen.queryByText('com_ui_skills_view_shared')).toBeNull();
    expect(screen.getByText('com_ui_skills_view_mine')).toBeInTheDocument();
  });
});
