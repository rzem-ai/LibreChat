import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LearningPanel from '../LearningPanel';

const mockStartTour = jest.fn();
const mockNavigate = jest.fn();
const mockSetActive = jest.fn();
let capturedOnComplete: (() => void) | undefined;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => ({
  useActivePanel: () => ({ active: 'learning', setActive: mockSetActive }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../useLandingPageTour', () => ({
  __esModule: true,
  default: (onComplete?: () => void) => {
    capturedOnComplete = onComplete;
    return { startTour: mockStartTour };
  },
}));

jest.mock('../DiffPopover', () => ({
  __esModule: true,
  default: () => <div data-testid="diff-popover-button" />,
}));

jest.mock('../RatingStars', () => ({
  __esModule: true,
  default: () => <div data-testid="rating-stars" />,
}));

describe('LearningPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('renders the active course as a clickable row that navigates, switches panel, and starts the tour', () => {
    render(<LearningPanel />);

    const activeRow = screen.getByTestId('learning-course-row-landing-page-buttons');
    expect(activeRow.tagName).toBe('BUTTON');

    fireEvent.click(activeRow);

    expect(mockNavigate).toHaveBeenCalledWith('/c/new');
    expect(mockSetActive).toHaveBeenCalledWith('conversations');

    act(() => {
      jest.runAllTimers();
    });
    expect(mockStartTour).toHaveBeenCalledTimes(1);
  });

  it('renders coming-soon courses as muted, non-clickable rows under a heading', () => {
    render(<LearningPanel />);

    const comingSoonRow = screen.getByTestId('learning-course-row-mcp-server-guide');
    expect(comingSoonRow.tagName).not.toBe('BUTTON');
    expect(screen.getByText('com_learning_coming_soon')).toBeInTheDocument();
  });

  it('does not show the rating prompt before the tour has completed', () => {
    render(<LearningPanel />);
    expect(screen.queryByTestId('rating-stars')).not.toBeInTheDocument();
  });

  it('shows the rating prompt once the tour reports completion', () => {
    render(<LearningPanel />);
    expect(capturedOnComplete).toBeDefined();

    act(() => {
      capturedOnComplete?.();
    });

    expect(screen.getByTestId('rating-stars')).toBeInTheDocument();
  });
});
