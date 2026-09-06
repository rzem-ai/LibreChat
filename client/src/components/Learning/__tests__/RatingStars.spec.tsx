import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import RatingStars from '../RatingStars';

const mockMutate = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useUpdateTutorialStateMutation: () => ({ mutate: mockMutate }),
}));

describe('RatingStars', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('submits the selected rating for the given course and shows a thank-you state', () => {
    render(<RatingStars courseId="landing-page-buttons" />);

    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(5);

    fireEvent.click(stars[3]);

    expect(mockMutate).toHaveBeenCalledWith({
      tutorialRatings: { 'landing-page-buttons': 4 },
    });
    expect(screen.getByText('com_learning_rate_thanks')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});
