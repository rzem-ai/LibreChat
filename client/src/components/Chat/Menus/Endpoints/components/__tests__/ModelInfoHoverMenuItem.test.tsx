// Deloitte Custom Change: exercises the shared hover target against the real Ariakit-backed
// CustomMenuItem (not a stand-in div), so the focus handlers and the `aria-describedby`
// relationship are verified on the element that actually receives keyboard focus.
import * as Ariakit from '@ariakit/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModelInfoHoverGroup, ModelInfoHoverTarget } from '@librechat/client';
import type { ModelInfoTooltipContent } from '@librechat/client';
import { CustomMenuItem as MenuItem } from '../../CustomMenu';

const content = (label: string): ModelInfoTooltipContent => ({
  icon: <span />,
  label,
  labels: {
    ariaLabel: 'Model details',
    speed: 'Speed',
    intelligence: 'Intelligence',
    cost: 'Cost',
    highCost: 'High Cost',
    context: 'Context',
    supports: 'Supports',
    ratingValue: (value, max) => `${value} of ${max}`,
  },
});

describe('ModelInfoHoverTarget with the real menu item', () => {
  it('opens on focus and associates the card with the focused item', () => {
    render(
      <Ariakit.MenuProvider open>
        <Ariakit.Menu portal={false} aria-label="Models">
          <ModelInfoHoverGroup>
            <ModelInfoHoverTarget content={content('Model A')}>
              <MenuItem>{'Model A'}</MenuItem>
            </ModelInfoHoverTarget>
            <ModelInfoHoverTarget content={content('Model B')}>
              <MenuItem>{'Model B'}</MenuItem>
            </ModelInfoHoverTarget>
          </ModelInfoHoverGroup>
        </Ariakit.Menu>
      </Ariakit.MenuProvider>,
    );
    const itemA = screen.getByText('Model A');
    const itemB = screen.getByText('Model B');
    expect(itemA).not.toHaveAttribute('aria-describedby');

    fireEvent.focus(itemA);
    const card = screen.getByRole('region');
    expect(card).toHaveTextContent('Model A');
    expect(itemA).toHaveAttribute('aria-describedby', card.id);
    expect(itemB).not.toHaveAttribute('aria-describedby');
  });
});
