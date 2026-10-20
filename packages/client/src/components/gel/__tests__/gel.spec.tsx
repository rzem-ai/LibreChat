import '@testing-library/jest-dom';
import * as GEL from '..';
import { render, screen } from '@testing-library/react';

describe('Typeset', () => {
  it('renders children and merges className', () => {
    render(
      <GEL.Typeset className="custom" data-testid="ts">
        <p>Body</p>
      </GEL.Typeset>,
    );
    expect(screen.getByTestId('ts')).toHaveClass('custom');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});

describe('GEL.TabsList underline variant', () => {
  it('scrolls horizontally, draws a baseline and keeps tab labels on one line', () => {
    render(
      <GEL.Tabs defaultValue="a">
        <GEL.TabsList variant="underline" data-testid="list">
          <GEL.TabsTrigger value="a" variant="underline">
            A long tab label
          </GEL.TabsTrigger>
        </GEL.TabsList>
      </GEL.Tabs>,
    );

    expect(screen.getByTestId('list')).toHaveClass('overflow-x-auto', 'border-b');
    expect(screen.getByRole('tab')).toHaveClass('whitespace-nowrap', 'shrink-0');
  });
});

describe('GEL.Header', () => {
  it('renders its children in a sticky header and merges className', () => {
    render(
      <GEL.Header className="custom">
        <button>First</button>
        <h1>Title</h1>
      </GEL.Header>,
    );

    const header = screen.getByRole('banner');
    expect(header).toHaveClass('sticky', 'top-0', 'custom');
    expect(header).toContainElement(screen.getByRole('button', { name: 'First' }));
    expect(header).toContainElement(screen.getByRole('heading', { name: 'Title' }));
  });
});
