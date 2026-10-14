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
let mockFlags: Record<string, boolean> | undefined = {};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<number, string | number>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data:
      mockFlags === undefined
        ? undefined
        : { interface: { customDeloitteFeatureFlags: mockFlags } },
  }),
}));

jest.mock('~/hooks/Learning', () => ({
  useAskFaqAgent: () => ({ faqAgent: undefined, askFaqAgent: jest.fn() }),
}));

jest.mock('../LearningTourContext', () => ({
  useLearningTour: () => ({
    startGettingStartedTour: mockStartTour,
    resumeGettingStartedTour: mockResumeTour,
  }),
}));

jest.mock('../content/loader', () => ({ RELEASES: [], getArticle: () => undefined }));

describe('Resources', () => {
  afterEach(() => jest.clearAllMocks());

  it('filters by title, description and tags', () => {
    render(<Resources onOpenArticle={jest.fn()} />);
    const input = screen.getByLabelText('com_learning_search_resources');

    fireEvent.change(input, { target: { value: 'agentic' } });
    expect(screen.getByText('What is the agentic ecosystem')).toBeInTheDocument();
    expect(screen.queryByText('Getting Started Tour')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('com_learning_no_resources:zzz-no-match')).toBeInTheDocument();
  });

  it('behaves per resource type on click', () => {
    const onOpenArticle = jest.fn();
    render(<Resources onOpenArticle={onOpenArticle} />);

    fireEvent.click(
      screen.getByLabelText('com_learning_action_read:What is the agentic ecosystem'),
    );
    expect(onOpenArticle).toHaveBeenCalledWith('agentic-ecosystem');

    fireEvent.click(screen.getByLabelText('com_learning_action_start_tour:Getting Started Tour'));
    expect(mockStartTour).toHaveBeenCalledTimes(1);

    const external = screen.getByLabelText(
      'com_learning_action_external:Book training sessions with the MyAssist team',
    );
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('Faq', () => {
  it('filters questions and highlights matches', () => {
    const { container } = render(<Faq />);
    fireEvent.change(screen.getByLabelText('com_learning_search_faq'), {
      target: { value: 'calendar' },
    });
    expect(screen.getByText(/How do I connect my files/)).toBeInTheDocument();
    expect(screen.queryByText(/Which AI model/)).not.toBeInTheDocument();
    expect(container.querySelector('mark')).toHaveTextContent(/calendar/i);
  });
});

describe('Academy', () => {
  const academyTree = (path: string) => (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/learning/:tab" element={<Page />} />
      </Routes>
    </MemoryRouter>
  );
  const renderAt = (path: string) => render(academyTree(path));

  afterEach(() => {
    mockFlags = {};
    window.localStorage.clear();
  });

  it('shows the Getting Started hero first and hides flagged tabs by default', () => {
    renderAt('/learning/tours');
    expect(screen.getByText('com_learning_start_here:Getting Started Tour')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'com_learning_tab_faq' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'com_learning_tab_releases' }),
    ).not.toBeInTheDocument();
  });

  it('redirects a flagged-off tab back to tours', () => {
    renderAt('/learning/faq');
    expect(screen.getByText('com_learning_start_here:Getting Started Tour')).toBeInTheDocument();
  });

  it('shows the flagged tabs when their flags are on', () => {
    mockFlags = { learningCommonQuestions: true, learningReleaseNotes: true };
    renderAt('/learning/faq');
    expect(screen.getByRole('tab', { name: 'com_learning_tab_faq' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'com_learning_tab_releases' })).toBeInTheDocument();
    expect(screen.getByLabelText('com_learning_search_faq')).toBeInTheDocument();
  });

  it('keeps a flagged tab URL while the startup config is still loading', () => {
    mockFlags = undefined;
    const { rerender } = renderAt('/learning/faq');
    expect(
      screen.queryByText('com_learning_start_here:Getting Started Tour'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('com_learning_search_faq')).toBeInTheDocument();

    mockFlags = { learningCommonQuestions: true, learningReleaseNotes: true };
    rerender(academyTree('/learning/faq'));
    expect(screen.getByRole('tab', { name: 'com_learning_tab_faq' })).toBeInTheDocument();
    expect(screen.getByLabelText('com_learning_search_faq')).toBeInTheDocument();
  });

  it('resumes an in-progress tour from its saved step', () => {
    window.localStorage.setItem(
      'learningTourProgress',
      JSON.stringify({ [GETTING_STARTED_COURSE_ID]: { step: 3, total: 9, completed: false } }),
    );
    renderAt('/learning/tours');
    fireEvent.click(screen.getByRole('button', { name: 'com_learning_tour_continue' }));
    expect(mockResumeTour).toHaveBeenCalledWith(3);
  });
});
