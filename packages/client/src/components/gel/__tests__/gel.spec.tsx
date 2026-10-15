import '@testing-library/jest-dom';
import { GEL, Typeset } from '..';
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

describe('GEL.TabsList underline variant', () => {
  it('scrolls horizontally only and keeps tab labels on one line', () => {
    render(
      <GEL.Tabs defaultValue="a">
        <GEL.TabsList variant="underline" data-testid="list">
          <GEL.TabsTrigger value="a" variant="underline">
            A long tab label
          </GEL.TabsTrigger>
        </GEL.TabsList>
      </GEL.Tabs>,
    );

    expect(screen.getByTestId('list')).toHaveClass('overflow-x-auto', 'overflow-y-hidden');
    expect(screen.getByRole('tab')).toHaveClass('whitespace-nowrap', 'shrink-0');
  });
});
