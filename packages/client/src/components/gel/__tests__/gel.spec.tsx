import '@testing-library/jest-dom';
import { Typeset } from '..';
import { render, screen } from '@testing-library/react';

describe('Typeset', () => {
  it('renders children and merges className', () => {
    render(
      <Typeset className="custom" data-testid="ts">
        <p>Body</p>
      </Typeset>,
    );
    expect(screen.getByTestId('ts')).toHaveClass('custom');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});
