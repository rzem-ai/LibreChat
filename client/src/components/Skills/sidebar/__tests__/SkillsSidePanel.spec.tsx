import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TSkillSummary } from 'librechat-data-provider';
import SkillsSidePanel from '../SkillsSidePanel';

const mockFetchNextPage = jest.fn();
const mockUseNavScrolling = jest.fn((_options?: object) => ({
  containerRef: { current: null },
}));
/*
 * Deloitte Custom Change: SkillList groups skills into Public/Shared/Mine
 * sections (PR #553) and renders nothing (not even a toggle) for an empty
 * group — and an empty group's internal open/closed state still counts
 * towards the "is any section open" signal SkillList reports upstream, since
 * it's seeded open and never gets a chance to close. One skill per group
 * keeps that signal meaningful: all three toggles are real and closing all
 * three is what actually drives the aggregate signal to false.
 */
const mockSkills: TSkillSummary[] = [
  {
    _id: 'skill-public',
    name: 'public-skill',
    description: 'A public skill',
    author: 'other-user',
    authorName: 'Other User',
    version: 1,
    source: 'inline',
    fileCount: 1,
    isPublic: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'skill-shared',
    name: 'shared-skill',
    description: 'A shared skill',
    author: 'other-user',
    authorName: 'Other User',
    version: 1,
    source: 'inline',
    fileCount: 1,
    isPublic: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'skill-mine',
    name: 'my-skill',
    description: 'A test skill',
    author: 'user-1',
    authorName: 'Test User',
    version: 1,
    source: 'inline',
    fileCount: 1,
    isPublic: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
const mockUseSkillsInfiniteQuery = jest.fn(() => ({
  data: {
    pages: [{ skills: mockSkills, has_more: true, after: 'cursor-2' }],
  },
  isFetchingNextPage: false,
  fetchNextPage: mockFetchNextPage,
  isLoading: false,
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => true,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { sidebarExpanded: {} },
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useDebounce: (value: string) => value,
  useNavScrolling: (options: object) => mockUseNavScrolling(options),
  // Deloitte Custom Change: SkillList (rendered here) reads the current user to
  // resolve Public/Shared/Mine grouping (PR #553).
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('~/data-provider', () => ({
  useSkillsInfiniteQuery: () => mockUseSkillsInfiniteQuery(),
}));

jest.mock('~/components/ui', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const PanelContent = ReactModule.forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>,
  );
  /** SkillList renders its body through Collapse, which keeps children mounted
   *  and marks them hidden when closed rather than unmounting them. */
  const Collapse = ({ open, children }: { open: boolean; children?: React.ReactNode }) => (
    <div aria-hidden={!open || undefined}>{children}</div>
  );
  return { PanelContent, Collapse };
});

jest.mock('../FilterSkills', () => ({
  __esModule: true,
  default: () => <div />,
}));

jest.mock('../../lists/SkillListItem', () => ({
  __esModule: true,
  default: () => null,
}));

describe('SkillsSidePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Deloitte Custom Change: rewritten for the Public/Shared/Mine grouping —
  // pagination is only disabled once every visible group is collapsed, and
  // re-enabled as soon as any one of them reopens.
  it('disables automatic pagination only once every skill group is collapsed', () => {
    render(
      <MemoryRouter>
        <SkillsSidePanel />
      </MemoryRouter>,
    );

    const publicToggle = screen.getByRole('button', { name: 'com_ui_skills_view_public' });
    const sharedToggle = screen.getByRole('button', { name: 'com_ui_skills_view_shared' });
    const mineToggle = screen.getByRole('button', { name: 'com_ui_skills_view_mine' });

    expect(publicToggle).toHaveAttribute('aria-expanded', 'true');
    expect(sharedToggle).toHaveAttribute('aria-expanded', 'true');
    expect(mineToggle).toHaveAttribute('aria-expanded', 'true');
    expect(mockUseNavScrolling).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );

    fireEvent.click(publicToggle);
    fireEvent.click(sharedToggle);
    expect(mockUseNavScrolling).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );

    fireEvent.click(mineToggle);

    expect(mineToggle).toHaveAttribute('aria-expanded', 'false');
    expect(mockUseNavScrolling).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );

    fireEvent.click(mineToggle);

    expect(mineToggle).toHaveAttribute('aria-expanded', 'true');
    expect(mockUseNavScrolling).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });
});
