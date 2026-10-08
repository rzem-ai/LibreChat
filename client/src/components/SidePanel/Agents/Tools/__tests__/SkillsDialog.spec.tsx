import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TSkillSummary } from 'librechat-data-provider';
import SkillsDialog from '../SkillsDialog';

const mockFetchNextPage = jest.fn();
const mockRefetch = jest.fn();
const mockUseListSkillsQuery = jest.fn();
const mockUseSkillsInfiniteQuery = jest.fn();
const mockToggleFavorite = jest.fn();
let mockFavoriteKeys = new Set<string>();

let mockInfiniteResult: {
  data?: { pages: Array<{ skills: TSkillSummary[] }> };
  isLoading: boolean;
  isError: boolean;
  fetchNextPage: jest.Mock;
  refetch: jest.Mock;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
};

jest.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
    getValues: (name: string) => (name === 'skills' ? [] : false),
    setValue: jest.fn(),
  }),
  useWatch: () => [],
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const values: Record<string, string> = {
      com_ui_skills: 'Skills',
      com_ui_search_skills: 'Search skills...',
      com_ui_skills_dialog_description: 'Browse and add skills to your agent.',
      com_ui_skills_load_error: 'Failed to load skills',
      com_ui_retry: 'Retry',
    };
    return values[key] ?? key;
  },
  useHasAccess: () => true,
  useAuthContext: () => ({ user: { id: 'user-1' } }),
  useToolFavorites: () => ({ favoriteKeys: mockFavoriteKeys, toggle: mockToggleFavorite }),
}));

jest.mock('~/data-provider', () => ({
  useListSkillsQuery: (...args: unknown[]) => mockUseListSkillsQuery(...args),
  useSkillsInfiniteQuery: (...args: unknown[]) => mockUseSkillsInfiniteQuery(...args),
}));

jest.mock('~/components/Prompts', () => ({
  CategoryIcon: () => <span aria-hidden="true" />,
}));

jest.mock('~/components/Skills/dialogs', () => ({
  CreateSkillDialog: () => null,
}));

jest.mock('../CategoryFilter', () => ({
  __esModule: true,
  default: ({
    options,
    onChange,
  }: {
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) => (
    <div>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <button type="button" onClick={() => onChange('all')}>
        all categories
      </button>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('../ItemDialog/ItemDialog', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../MarketplaceCatalog', () => ({
  __esModule: true,
  default: ({
    items,
    ariaLabel,
  }: {
    items: Array<{ id: string; name: string }>;
    ariaLabel: string;
  }) => (
    <ul aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  ),
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => (
    <label {...props}>{children}</label>
  ),
  Radio: ({
    options,
    onChange,
  }: {
    options: Array<{ value: string; label: string }>;
    onChange?: (value: string) => void;
  }) => (
    <div>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange?.(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
  OGDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  OGDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  /** The header renders one DOM order per breakpoint; these cases are about
   *  pagination, so they run as the desktop one. */
  useMediaQuery: () => true,
}));

function makeSkill(
  id: string,
  name: string,
  overrides: Partial<Pick<TSkillSummary, 'isPublic' | 'author' | 'authorName' | 'category'>> = {},
): TSkillSummary {
  return {
    _id: id,
    name,
    description: `${name} description`,
    author: 'user-1',
    authorName: 'E2E User',
    version: 1,
    source: 'inline',
    fileCount: 0,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockInfiniteResult = {
    data: { pages: [{ skills: [makeSkill('first', 'first-skill')] }] },
    isLoading: false,
    isError: false,
    fetchNextPage: mockFetchNextPage,
    refetch: mockRefetch,
    hasNextPage: true,
    isFetchingNextPage: false,
  };
  mockFetchNextPage.mockReset();
  mockRefetch.mockReset();
  mockUseListSkillsQuery.mockReset();
  mockUseListSkillsQuery.mockReturnValue({
    data: { skills: [makeSkill('first', 'first-skill')] },
    isLoading: false,
  });
  mockUseSkillsInfiniteQuery.mockReset();
  mockUseSkillsInfiniteQuery.mockImplementation(() => mockInfiniteResult);
  mockToggleFavorite.mockReset();
  mockFavoriteKeys = new Set<string>();
});

describe('SkillsDialog pagination', () => {
  test('auto-fetches every page and stops after the final page', () => {
    const { rerender } = render(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    expect(mockUseSkillsInfiniteQuery).toHaveBeenCalledWith({ limit: 100 }, { enabled: true });
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);

    mockInfiniteResult = {
      ...mockInfiniteResult,
      isFetchingNextPage: true,
    };
    rerender(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);

    mockInfiniteResult = {
      ...mockInfiniteResult,
      data: {
        pages: [
          { skills: [makeSkill('first', 'first-skill')] },
          { skills: [makeSkill('second', 'second-skill')] },
        ],
      },
      hasNextPage: true,
      isFetchingNextPage: false,
    };
    rerender(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    expect(mockFetchNextPage).toHaveBeenCalledTimes(2);
    expect(screen.getByText('second-skill')).toBeInTheDocument();

    mockInfiniteResult = {
      ...mockInfiniteResult,
      isFetchingNextPage: true,
    };
    rerender(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    expect(mockFetchNextPage).toHaveBeenCalledTimes(2);

    mockInfiniteResult = {
      ...mockInfiniteResult,
      data: {
        pages: [
          { skills: [makeSkill('first', 'first-skill')] },
          { skills: [makeSkill('second', 'second-skill')] },
          { skills: [makeSkill('third', 'third-skill')] },
        ],
      },
      hasNextPage: false,
      isFetchingNextPage: false,
    };
    rerender(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    expect(screen.getByText('third-skill')).toBeInTheDocument();
    expect(mockFetchNextPage).toHaveBeenCalledTimes(2);
  });

  test('flattens and de-duplicates every loaded page for discovery', () => {
    mockInfiniteResult = {
      ...mockInfiniteResult,
      data: {
        pages: [
          { skills: [makeSkill('first', 'first-skill')] },
          {
            skills: [makeSkill('first', 'first-skill'), makeSkill('off-page', 'off-page-skill')],
          },
        ],
      },
      hasNextPage: false,
    };

    render(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    expect(screen.getAllByText('first-skill')).toHaveLength(1);
    expect(screen.getByText('off-page-skill')).toBeInTheDocument();
  });

  test('shows a recoverable pagination error and retries on request', () => {
    mockInfiniteResult = {
      ...mockInfiniteResult,
      isError: true,
    };
    render(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);
    expect(mockFetchNextPage).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load skills');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  test('resumes pagination after an external refetch clears the error', () => {
    mockInfiniteResult = {
      ...mockInfiniteResult,
      isError: true,
    };
    const { rerender } = render(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);
    expect(mockFetchNextPage).not.toHaveBeenCalled();

    mockInfiniteResult = {
      ...mockInfiniteResult,
      isError: false,
    };
    rerender(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SkillsDialog view grouping', () => {
  test('Public/Shared/Mine tabs narrow the list per the locked precedence rule (public wins)', () => {
    mockInfiniteResult = {
      ...mockInfiniteResult,
      data: {
        pages: [
          {
            skills: [
              makeSkill('public-and-shared', 'public-and-shared-skill', {
                isPublic: true,
                author: 'other-user',
                authorName: 'Other',
              }),
              makeSkill('shared-only', 'shared-only-skill', {
                author: 'other-user',
                authorName: 'Other',
              }),
              makeSkill('mine', 'my-skill', { author: 'user-1' }),
            ],
          },
        ],
      },
      hasNextPage: false,
    };

    render(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    // All (default view): everything shows.
    expect(screen.getByText('public-and-shared-skill')).toBeInTheDocument();
    expect(screen.getByText('shared-only-skill')).toBeInTheDocument();
    expect(screen.getByText('my-skill')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_skills_view_public' }));
    expect(screen.getByText('public-and-shared-skill')).toBeInTheDocument();
    expect(screen.queryByText('shared-only-skill')).toBeNull();
    expect(screen.queryByText('my-skill')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_skills_view_shared' }));
    expect(screen.queryByText('public-and-shared-skill')).toBeNull();
    expect(screen.getByText('shared-only-skill')).toBeInTheDocument();
    expect(screen.queryByText('my-skill')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_skills_view_mine' }));
    expect(screen.queryByText('public-and-shared-skill')).toBeNull();
    expect(screen.queryByText('shared-only-skill')).toBeNull();
    expect(screen.getByText('my-skill')).toBeInTheDocument();
  });

  test('Favorites tab narrows the list to favorited skills, alongside Public/Shared/Mine', () => {
    mockInfiniteResult = {
      ...mockInfiniteResult,
      data: {
        pages: [
          {
            skills: [
              makeSkill('favorited', 'favorited-skill', { author: 'user-1' }),
              makeSkill('not-favorited', 'not-favorited-skill', { author: 'user-1' }),
            ],
          },
        ],
      },
      hasNextPage: false,
    };
    mockFavoriteKeys = new Set(['skill:favorited']);

    render(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_tools_view_favorites' }));
    expect(screen.getByText('favorited-skill')).toBeInTheDocument();
    expect(screen.queryByText('not-favorited-skill')).toBeNull();
  });

  test('category filter narrows the list and still combines with a group view', () => {
    mockInfiniteResult = {
      ...mockInfiniteResult,
      data: {
        pages: [
          {
            skills: [
              makeSkill('writing-mine', 'writing-mine-skill', {
                category: 'writing',
                author: 'user-1',
              }),
              makeSkill('coding-mine', 'coding-mine-skill', {
                category: 'coding',
                author: 'user-1',
              }),
              makeSkill('writing-shared', 'writing-shared-skill', {
                category: 'writing',
                author: 'other-user',
                authorName: 'Other',
              }),
            ],
          },
        ],
      },
      hasNextPage: false,
    };

    render(<SkillsDialog open onOpenChange={jest.fn()} agentId="agent-1" />);

    // Category alone, no view narrowing: only "Writing" skills remain, across owners.
    fireEvent.click(screen.getByRole('button', { name: 'Writing' }));
    expect(screen.getByText('writing-mine-skill')).toBeInTheDocument();
    expect(screen.getByText('writing-shared-skill')).toBeInTheDocument();
    expect(screen.queryByText('coding-mine-skill')).toBeNull();

    /* Switching the view tab resets the category filter (pre-existing
       behavior, unchanged by grouping) — select the view first, then the
       category, to see the two axes actually compose. */
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_skills_view_mine' }));
    expect(screen.getByText('writing-mine-skill')).toBeInTheDocument();
    expect(screen.getByText('coding-mine-skill')).toBeInTheDocument();
    expect(screen.queryByText('writing-shared-skill')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Writing' }));
    expect(screen.getByText('writing-mine-skill')).toBeInTheDocument();
    expect(screen.queryByText('coding-mine-skill')).toBeNull();
    expect(screen.queryByText('writing-shared-skill')).toBeNull();
  });
});
