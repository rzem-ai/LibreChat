import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import CourseCompletionModal from '../CourseCompletionModal';

const mockDismissCompletion = jest.fn();
const mockUseLearningTour = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../LearningTourContext', () => ({
  useLearningTour: () => mockUseLearningTour(),
}));

jest.mock('../RatingStars', () => ({
  __esModule: true,
  default: ({ courseId }: { courseId: string }) => <div data-testid="rating-stars">{courseId}</div>,
}));

describe('CourseCompletionModal', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is hidden until a course has completed', () => {
    mockUseLearningTour.mockReturnValue({
      completedCourseId: null,
      dismissCompletion: mockDismissCompletion,
    });
    render(<CourseCompletionModal />);
    expect(screen.queryByText('com_learning_complete_title')).not.toBeInTheDocument();
  });

  it('shows a completion message and the rating prompt once a course finishes, dismissing on Done', () => {
    mockUseLearningTour.mockReturnValue({
      completedCourseId: 'getting-started-guide',
      dismissCompletion: mockDismissCompletion,
    });
    render(<CourseCompletionModal />);

    expect(screen.getByText('com_learning_complete_title')).toBeInTheDocument();
    expect(screen.getByTestId('rating-stars')).toHaveTextContent('getting-started-guide');

    fireEvent.click(screen.getByText('com_learning_complete_done'));
    expect(mockDismissCompletion).toHaveBeenCalledTimes(1);
  });
});
