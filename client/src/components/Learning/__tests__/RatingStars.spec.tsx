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
  beforeEach(() => {
    mockMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('submits the selected rating for the given course and shows a thank-you state', () => {
    render(<RatingStars courseId="getting-started-guide" />);

    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(5);

    fireEvent.click(stars[3]);

    expect(mockMutate).toHaveBeenCalledWith({
      tutorialRatings: { 'getting-started-guide': 4 },
    }, expect.any(Object));
    expect(screen.getByText('com_learning_rate_thanks')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('keeps the rating controls visible when the mutation does not succeed', () => {
    mockMutate.mockImplementation(() => undefined);
    render(<RatingStars courseId="getting-started-guide" />);

    const stars = screen.getAllByRole('radio');
    fireEvent.click(stars[3]);

    expect(screen.getByText('com_learning_rate_prompt')).toBeInTheDocument();
    expect(screen.queryByText('com_learning_rate_thanks')).not.toBeInTheDocument();
  });
});
