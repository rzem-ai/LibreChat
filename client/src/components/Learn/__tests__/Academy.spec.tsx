import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { GETTING_STARTED_COURSE_ID } from '../content/registry';
import Resources from '../Academy/resources/Page';
import Faq from '../Academy/faq/Page';
import Page from '../Academy/Page';

const mockStartTour = jest.fn();
const mockResumeTour = jest.fn();
let mockFlags: Record<string, boolean> = {};
let mockConfigStatus: 'loading' | 'error' | 'success' = 'success';
let mockTutorialProgress: Record<string, { step: number; total: number; completed: boolean }> = {};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<number, string | number>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data:
      mockConfigStatus !== 'success'
        ? undefined
        : { interface: { customDeloitteFeatureFlags: mockFlags } },
    isLoading: mockConfigStatus === 'loading',
  }),
  useTutorialStateQuery: () => ({
    data: { tutorialProgress: mockTutorialProgress },
    isSuccess: true,
  }),
  useUpdateTourProgressMutation: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ isAuthenticated: true }),
}));

jest.mock('~/hooks/Learning', () => ({
  useAskFaqAgent: () => ({ faqAgent: undefined, askFaqAgent: jest.fn() }),
}));

jest.mock('../LearningTourContext', () => ({
  useLearningTour: () => ({
    startCourseTour: mockStartTour,
    resumeCourseTour: mockResumeTour,
  }),
}));

jest.mock('../content/loader', () => ({
  loadReleases: () => Promise.resolve([]),
  loadArticle: () => Promise.resolve(null),
}));

describe('Resources', () => {
  afterEach(() => jest.clearAllMocks());

  const renderResources = () =>
    render(
      <MemoryRouter>
        <Resources />
      </MemoryRouter>,
    );

  it('groups resources under labelled sections in a fixed order', () => {
    renderResources();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'com_learning_section_start',
      'com_learning_section_guides',
      'com_learning_section_further',
      'com_learning_section_reference',
      'com_learning_section_external',
    ]);
  });

  it('shows the Getting Started tour once, above the search', () => {
    renderResources();

    const tour = screen.getByText('Getting Started Tour');
    const search = screen.getByLabelText('com_learning_search_resources');
    expect(screen.getAllByText('Getting Started Tour')).toHaveLength(1);
    expect(tour.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('filters by title, description and tags and hides empty sections', () => {
    renderResources();
    const input = screen.getByLabelText('com_learning_search_resources');

    fireEvent.change(input, { target: { value: 'agentic' } });
    expect(screen.getByText('What is the Agentic Ecosystem')).toBeInTheDocument();
    expect(screen.queryByText('Guide to skills')).not.toBeInTheDocument();
    expect(screen.queryByText('com_learning_section_guides')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('com_learning_no_resources:zzz-no-match')).toBeInTheDocument();
  });

  it('renders articles as links and externals as new-tab links', () => {
    renderResources();

    expect(
      screen.getByRole('link', { name: 'com_learning_action_read:Guide to skills' }),
    ).toHaveAttribute('href', '/learn/articles/guides/skills');

    const external = screen.getByLabelText(
      'com_learning_action_external:Book in with a MyAssist team member',
    );
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('Faq', () => {
  it('lists every question with working links while search is hidden', () => {
    render(
      <MemoryRouter>
        <Faq />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: 'Make your team’s knowledge reusable' }),
    ).toHaveAttribute(
      'href',
      '/learn/articles/capture-team-knowledge#match-the-knowledge-to-the-surface',
    );
    expect(screen.getByRole('link', { name: 'Q&R or BSO' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Is MyAssist connected/)).toBeInTheDocument();
    expect(screen.getByText(/Which model should I use/)).toBeInTheDocument();
    expect(screen.queryByLabelText('com_learning_search_faq')).not.toBeInTheDocument();
  });
});

describe('Academy', () => {
  const academyTree = (path: string) => (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/learn/:tab" element={<Page />} />
      </Routes>
    </MemoryRouter>
  );
  const renderAt = (path: string) => render(academyTree(path));

  afterEach(() => {
    mockFlags = {};
    mockConfigStatus = 'success';
    mockTutorialProgress = {};
  });

  it('shows the Getting Started tour above the search and hides flagged tabs by default', () => {
    renderAt('/learn/resources');
    expect(screen.getByText('Getting Started Tour')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'com_learning_tab_faq' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'com_learning_tab_releases' }),
    ).not.toBeInTheDocument();
  });

  it('redirects a flagged-off tab back to resources', () => {
    renderAt('/learn/faq');
    expect(screen.getByText('Getting Started Tour')).toBeInTheDocument();
  });

  it('shows the flagged tabs when their flags are on', () => {
    mockFlags = { learningCommonQuestions: true, learningReleaseNotes: true };
    renderAt('/learn/faq');
    expect(screen.getByRole('tab', { name: 'com_learning_tab_faq' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'com_learning_tab_releases' })).toBeInTheDocument();
    expect(screen.getByText(/Is MyAssist connected/)).toBeInTheDocument();
  });

  it('falls back to resources when the startup config failed to load', () => {
    mockConfigStatus = 'error';
    renderAt('/learn/faq');
    expect(screen.getByText('Getting Started Tour')).toBeInTheDocument();
    expect(screen.queryByText(/Is MyAssist connected/)).not.toBeInTheDocument();
  });

  it('keeps a flagged tab URL while the startup config is still loading', () => {
    mockConfigStatus = 'loading';
    const { rerender } = renderAt('/learn/faq');
    expect(screen.queryByText('Getting Started Tour')).not.toBeInTheDocument();
    expect(screen.getByText(/Is MyAssist connected/)).toBeInTheDocument();

    mockConfigStatus = 'success';
    mockFlags = { learningCommonQuestions: true, learningReleaseNotes: true };
    rerender(academyTree('/learn/faq'));
    expect(screen.getByRole('tab', { name: 'com_learning_tab_faq' })).toBeInTheDocument();
    expect(screen.getByText(/Is MyAssist connected/)).toBeInTheDocument();
  });

  it('resumes an in-progress tour from its saved step', () => {
    mockTutorialProgress = {
      [GETTING_STARTED_COURSE_ID]: { step: 3, total: 9, completed: false },
    };
    renderAt('/learn/resources');
    fireEvent.click(screen.getByRole('button', { name: 'com_learning_tour_continue' }));
    expect(mockResumeTour).toHaveBeenCalledWith(GETTING_STARTED_COURSE_ID, 3);
  });
});
