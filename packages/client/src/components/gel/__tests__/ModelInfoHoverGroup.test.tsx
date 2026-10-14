// Deloitte Custom Change: interaction coverage for the shared hover state machine —
// row-to-row content switching, delayed close with cancellation (by a re-entered row, by the
// card itself, and by refocusing), and keyboard focus/blur parity with pointer events. The
// presentational card body is covered separately in ModelInfoTooltip.test.tsx.
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ModelInfoTooltipLabels, ModelInfoTooltipContent } from '../ModelInfoTooltip';
import { ModelInfoHoverGroup, ModelInfoHoverTarget } from '../ModelInfoTooltip';

const labels: ModelInfoTooltipLabels = {
  ariaLabel: 'Model details',
  speed: 'Speed',
  intelligence: 'Intelligence',
  cost: 'Cost',
  highCost: 'High Cost',
  context: 'Context',
  supports: 'Supports',
  ratingValue: (value, max) => `${value} of ${max}`,
};

function contentFor(label: string): ModelInfoTooltipContent {
  return { icon: <span />, label, labels };
}

function Row({ label }: { label: string }) {
  return (
    <ModelInfoHoverTarget content={contentFor(label)}>
      <div tabIndex={0}>{label}</div>
    </ModelInfoHoverTarget>
  );
}

function setup() {
  render(
    <ModelInfoHoverGroup>
      <Row label="Model A" />
      <Row label="Model B" />
    </ModelInfoHoverGroup>,
  );
  return {
    rowA: screen.getByText('Model A'),
    rowB: screen.getByText('Model B'),
  };
}

function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('ModelInfoHoverGroup interactions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a row's content on hover", () => {
    const { rowA } = setup();
    fireEvent.pointerEnter(rowA);
    expect(screen.getByRole('region')).toHaveTextContent('Model A');
  });

  it('switches content immediately when the pointer moves to another row', () => {
    const { rowA, rowB } = setup();
    fireEvent.pointerEnter(rowA);
    fireEvent.pointerLeave(rowA);
    fireEvent.pointerEnter(rowB);
    expect(screen.getByRole('region')).toHaveTextContent('Model B');

    // row A's pending close must not fire and close the card out from under row B
    advance(100);
    expect(screen.getByRole('region')).toHaveTextContent('Model B');
  });

  it('keeps the card open briefly after the pointer leaves a row, then closes it', () => {
    const { rowA } = setup();
    fireEvent.pointerEnter(rowA);
    fireEvent.pointerLeave(rowA);
    expect(screen.getByRole('region')).toBeInTheDocument();

    advance(49);
    expect(screen.getByRole('region')).toBeInTheDocument();

    advance(1);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('cancels the pending close when the pointer enters the card itself', () => {
    const { rowA } = setup();
    fireEvent.pointerEnter(rowA);
    fireEvent.pointerLeave(rowA);
    advance(30);

    fireEvent.pointerEnter(screen.getByRole('region'));
    advance(30);
    expect(screen.getByRole('region')).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByRole('region'));
    advance(50);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('opens on keyboard focus and closes on blur after the same delay', () => {
    const { rowA } = setup();
    fireEvent.focus(rowA);
    expect(screen.getByRole('region')).toHaveTextContent('Model A');

    fireEvent.blur(rowA);
    advance(49);
    expect(screen.getByRole('region')).toBeInTheDocument();

    advance(1);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
