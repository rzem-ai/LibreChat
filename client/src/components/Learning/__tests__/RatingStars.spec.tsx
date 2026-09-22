import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import RatingStars from '../RatingStars';
const mockOnSelect = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('RatingStars', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls onSelect when a rating is chosen', () => {
    render(<RatingStars selected={null} onSelect={mockOnSelect} />);

    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(5);

    fireEvent.click(stars[3]);

    expect(mockOnSelect).toHaveBeenCalledWith(4);
    expect(screen.queryByText('com_learning_rate_thanks')).not.toBeInTheDocument();
  });

  it('reflects the currently selected rating', () => {
    const { rerender } = render(<RatingStars selected={null} onSelect={mockOnSelect} />);

    rerender(<RatingStars selected={4} onSelect={mockOnSelect} />);

    expect(screen.getByTestId('course-rating-star-4')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('com_learning_rate_prompt')).toBeInTheDocument();
  });
});
