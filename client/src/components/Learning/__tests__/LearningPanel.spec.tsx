import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import LearningPanel from '../LearningPanel';

const mockStartGettingStartedTour = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../LearningTourContext', () => ({
  useLearningTour: () => ({
    startGettingStartedTour: mockStartGettingStartedTour,
    completedCourseId: null,
    dismissCompletion: jest.fn(),
  }),
}));

describe('LearningPanel', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the active course as a clickable row that starts the shared tour', () => {
    render(<LearningPanel />);

    const activeRow = screen.getByTestId('learning-course-row-getting-started-guide');
    expect(activeRow.tagName).toBe('BUTTON');

    fireEvent.click(activeRow);
    expect(mockStartGettingStartedTour).toHaveBeenCalledTimes(1);
  });

  it('renders coming-soon courses as muted, non-clickable rows under a heading', () => {
    render(<LearningPanel />);

    const comingSoonRow = screen.getByTestId('learning-course-row-mcp-server-guide');
    expect(comingSoonRow.tagName).not.toBe('BUTTON');
    expect(screen.getByText('com_learning_coming_soon')).toBeInTheDocument();
  });
});
