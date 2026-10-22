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

  it('filters by title, description and tags', () => {
    render(<Resources onOpenArticle={jest.fn()} />);
    const input = screen.getByLabelText('com_learning_search_resources');

    fireEvent.change(input, { target: { value: 'agentic' } });
    expect(screen.getByText('What is the Agentic Ecosystem')).toBeInTheDocument();
    expect(screen.queryByText('Getting Started Tour')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('com_learning_no_resources:zzz-no-match')).toBeInTheDocument();
  });

  it('behaves per resource type on click', () => {
    const onOpenArticle = jest.fn();
    render(<Resources onOpenArticle={onOpenArticle} />);

    fireEvent.click(
      screen.getByLabelText('com_learning_action_read:What is the Agentic Ecosystem'),
    );
    expect(onOpenArticle).toHaveBeenCalledWith('agentic-ecosystem');

    fireEvent.click(screen.getByLabelText('com_learning_action_start_tour:Getting Started Tour'));
    expect(mockStartTour).toHaveBeenCalledWith(GETTING_STARTED_COURSE_ID);

    const external = screen.getByLabelText(
      'com_learning_action_external:Book in with a MyAssist team member',
    );
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('Faq', () => {
  it('filters questions and highlights matches', () => {
    const { container } = render(
      <MemoryRouter>
        <Faq />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: 'How to capture your team’s knowledge' }),
    ).toHaveAttribute(
      'href',
      '/learn/articles/capture-team-knowledge#match-the-knowledge-to-the-surface',
    );
    expect(screen.getByRole('link', { name: 'Q&R or BSO' })).toHaveAttribute('target', '_blank');
    fireEvent.change(screen.getByLabelText('com_learning_search_faq'), {
      target: { value: 'connector' },
    });
    expect(screen.getByText(/Is MyAssist connected/)).toBeInTheDocument();
    expect(screen.queryByText(/Which model/)).not.toBeInTheDocument();
    expect(container.querySelector('mark')).toHaveTextContent(/connector/i);
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

  it('shows the Getting Started hero first and hides flagged tabs by default', () => {
    renderAt('/learn/tours');
    expect(screen.getByText('com_learning_start_here:Getting Started Tour')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'com_learning_tab_faq' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'com_learning_tab_releases' }),
    ).not.toBeInTheDocument();
  });

  it('redirects a flagged-off tab back to tours', () => {
    renderAt('/learn/faq');
    expect(screen.getByText('com_learning_start_here:Getting Started Tour')).toBeInTheDocument();
  });

  it('shows the flagged tabs when their flags are on', () => {
    mockFlags = { learningCommonQuestions: true, learningReleaseNotes: true };
    renderAt('/learn/faq');
    expect(screen.getByRole('tab', { name: 'com_learning_tab_faq' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'com_learning_tab_releases' })).toBeInTheDocument();
    expect(screen.getByLabelText('com_learning_search_faq')).toBeInTheDocument();
  });

  it('falls back to tours when the startup config failed to load', () => {
    mockConfigStatus = 'error';
    renderAt('/learn/faq');
    expect(screen.getByText('com_learning_start_here:Getting Started Tour')).toBeInTheDocument();
    expect(screen.queryByLabelText('com_learning_search_faq')).not.toBeInTheDocument();
  });

  it('keeps a flagged tab URL while the startup config is still loading', () => {
    mockConfigStatus = 'loading';
    const { rerender } = renderAt('/learn/faq');
    expect(
      screen.queryByText('com_learning_start_here:Getting Started Tour'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('com_learning_search_faq')).toBeInTheDocument();

    mockConfigStatus = 'success';
    mockFlags = { learningCommonQuestions: true, learningReleaseNotes: true };
    rerender(academyTree('/learn/faq'));
    expect(screen.getByRole('tab', { name: 'com_learning_tab_faq' })).toBeInTheDocument();
    expect(screen.getByLabelText('com_learning_search_faq')).toBeInTheDocument();
  });

  it('resumes an in-progress tour from its saved step', () => {
    mockTutorialProgress = {
      [GETTING_STARTED_COURSE_ID]: { step: 3, total: 9, completed: false },
    };
    renderAt('/learn/tours');
    fireEvent.click(screen.getByRole('button', { name: 'com_learning_tour_continue' }));
    expect(mockResumeTour).toHaveBeenCalledWith(GETTING_STARTED_COURSE_ID, 3);
  });
});
