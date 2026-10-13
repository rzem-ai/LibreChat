// Deloitte Custom Change: new file — presentational render coverage for the shared gel
// ModelInfoTooltip (Figma node 855:37722): header, rating meters, cost/context/supports rows.
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ModelInfoTooltipLabels } from '../ModelInfoTooltip';
import { ModelInfoTooltip } from '../ModelInfoTooltip';

// Deloitte Custom Change: Radix HoverCard only mounts content on hover/focus; render it open
// always so these tests can assert on ModelInfoTooltip's own markup.
jest.mock('../../HoverCard', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children, ...rest }: { children: ReactNode }) => (
    <div {...rest}>{children}</div>
  ),
}));

const labels: ModelInfoTooltipLabels = {
  ariaLabel: 'Model details',
  speed: 'Speed',
  intelligence: 'Intelligence',
  cost: 'Cost',
  context: 'Context',
  supports: 'Supports',
};

describe('ModelInfoTooltip', () => {
  it('renders the icon, stacked group name, label, and description in the header', () => {
    render(
      <ModelInfoTooltip
        icon={<span data-testid="icon" />}
        group="OpenAI Global"
        label="My Spec"
        description="A helpful model"
        labels={labels}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Global')).toBeInTheDocument();
    expect(screen.getByText('My Spec')).toBeInTheDocument();
    expect(screen.getByText('A helpful model')).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAccessibleName('Model details');
  });

  it('omits the group line when no group is given', () => {
    render(
      <ModelInfoTooltip icon={<span />} label="My Spec" labels={labels}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.queryByText('OpenAI Global')).not.toBeInTheDocument();
    expect(screen.getByText('My Spec')).toBeInTheDocument();
  });

  it('renders Speed and Intelligence as N-of-5 rating meters, centered with their label', () => {
    render(
      <ModelInfoTooltip icon={<span />} label="My Spec" speed={3} intelligence={5} labels={labels}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    const meters = screen.getAllByRole('img');
    expect(meters).toHaveLength(2);
    expect(meters[0]).toHaveAccessibleName('3 of 5');
    expect(meters[1]).toHaveAccessibleName('5 of 5');
    expect(screen.getByText('Speed').parentElement).toHaveClass('items-center');
    expect(screen.getByText('Intelligence').parentElement).toHaveClass('items-center');
  });

  it('renders a cost row with a tier meter and input/output price lines, top-aligned', () => {
    render(
      <ModelInfoTooltip
        icon={<span />}
        label="My Spec"
        cost={{ tier: 2, inputText: '$1.00 / 1M input', outputText: '$6.00 / 1M output' }}
        labels={labels}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByRole('img', { name: '2 of 5' })).toBeInTheDocument();
    expect(screen.getByText('$1.00 / 1M input')).toBeInTheDocument();
    expect(screen.getByText('$6.00 / 1M output')).toBeInTheDocument();
    expect(screen.getByText('Cost').parentElement).toHaveClass('items-start');
  });

  it('renders context as plain text with no meter, top-aligned with its label', () => {
    render(
      <ModelInfoTooltip icon={<span />} label="My Spec" contextLabel="128K" labels={labels}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByText('128K')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Context').parentElement).toHaveClass('items-start');
  });

  it('renders a supports row listing every given capability', () => {
    render(
      <ModelInfoTooltip
        icon={<span />}
        label="My Spec"
        supports={['Web search', 'Image generation']}
        labels={labels}
      >
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.getByText('Supports')).toBeInTheDocument();
    expect(screen.getByText('Web search')).toBeInTheDocument();
    expect(screen.getByText('Image generation')).toBeInTheDocument();
  });

  it('omits the supports row entirely when supports is empty', () => {
    render(
      <ModelInfoTooltip icon={<span />} label="My Spec" supports={[]} labels={labels}>
        <button>Row</button>
      </ModelInfoTooltip>,
    );
    expect(screen.queryByText('Supports')).not.toBeInTheDocument();
  });
});
