/**
 * Isolated coverage for the visible-label addition to `SkillToggle`. Before
 * this change the control was an icon-only switch with only an
 * `aria-label` — sighted users had no indication of what "on"/"off" meant.
 * Locks in: the label renders when provided, is hidden from assistive tech
 * (the `aria-label` already carries the full accessible name), the switch
 * still works with no label at all, and click/keyboard behavior is
 * untouched by the addition.
 */
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import SkillToggle from '../SkillToggle';

describe('SkillToggle', () => {
  it('renders a visible label next to the switch when provided', () => {
    render(
      <SkillToggle
        enabled
        onChange={jest.fn()}
        ariaLabel="Toggle skill active state"
        label="Active"
      />,
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('hides the visible label from assistive tech (aria-label already carries the accessible name)', () => {
    render(
      <SkillToggle
        enabled
        onChange={jest.fn()}
        ariaLabel="Toggle skill active state"
        label="Active"
      />,
    );

    const label = screen.getByText('Active');
    expect(label).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders with no visible label at all when the prop is omitted', () => {
    render(<SkillToggle enabled onChange={jest.fn()} ariaLabel="Toggle skill active state" />);

    expect(screen.getByRole('switch', { name: 'Toggle skill active state' })).toBeInTheDocument();
  });

  it('reflects the enabled/disabled visual state via aria-checked', () => {
    const { rerender } = render(
      <SkillToggle
        enabled
        onChange={jest.fn()}
        ariaLabel="Toggle skill active state"
        label="Active"
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    rerender(
      <SkillToggle
        enabled={false}
        onChange={jest.fn()}
        ariaLabel="Toggle skill active state"
        label="Disabled"
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('calls onChange and stops propagation on click', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onParentClick = jest.fn();

    render(
      <div onClick={onParentClick}>
        <SkillToggle
          enabled={false}
          onChange={onChange}
          ariaLabel="Toggle skill active state"
          label="Disabled"
        />
      </div>,
    );

    await user.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledTimes(1);
    /* The switch calls stopPropagation so clicking it inside a larger
       clickable row (e.g. a skill list item) doesn't also trigger the
       row's own click handler. */
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
