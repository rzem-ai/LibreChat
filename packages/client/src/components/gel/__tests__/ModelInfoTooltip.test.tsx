// Deloitte Custom Change: presentational render coverage for the shared gel
// ModelInfoTooltipCard (Figma node 855:37722): header, rating meters, cost/context/supports
// rows. No HoverCard involved — positioning and open/close behavior live in
// ModelInfoHoverGroup, covered separately in ModelInfoHoverGroup.test.tsx.
import { render, screen } from '@testing-library/react';
import type { ModelInfoTooltipLabels } from '../ModelInfoTooltip';
import { ModelInfoTooltipCard } from '../ModelInfoTooltip';

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

describe('ModelInfoTooltipCard', () => {
  it('renders the icon, stacked group name, label, and description in the header', () => {
    render(
      <ModelInfoTooltipCard
        icon={<span data-testid="icon" />}
        group="OpenAI Global"
        label="My Spec"
        description="A helpful model"
        labels={labels}
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Global')).toBeInTheDocument();
    expect(screen.getByText('My Spec')).toBeInTheDocument();
    expect(screen.getByText('A helpful model')).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAccessibleName('Model details');
  });

  it('omits the group line when no group is given', () => {
    render(<ModelInfoTooltipCard icon={<span />} label="My Spec" labels={labels} />);
    expect(screen.queryByText('OpenAI Global')).not.toBeInTheDocument();
    expect(screen.getByText('My Spec')).toBeInTheDocument();
  });

  it('renders Speed and Intelligence as N-of-5 rating meters, centered with their label', () => {
    render(
      <ModelInfoTooltipCard
        icon={<span />}
        label="My Spec"
        speed={3}
        intelligence={5}
        labels={labels}
      />,
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
      <ModelInfoTooltipCard
        icon={<span />}
        label="My Spec"
        cost={{ tier: 2, inputText: '$1.00 / 1M input', outputText: '$6.00 / 1M output' }}
        labels={labels}
      />,
    );
    expect(screen.getByRole('img', { name: '2 of 5' })).toBeInTheDocument();
    expect(screen.getByText('$1.00 / 1M input')).toBeInTheDocument();
    expect(screen.getByText('$6.00 / 1M output')).toBeInTheDocument();
    expect(screen.getByText('Cost').parentElement).toHaveClass('items-start');
  });

  it('shows the "High Cost" chip below the rating bar when the cost is flagged high-cost', () => {
    render(
      <ModelInfoTooltipCard
        icon={<span />}
        label="My Spec"
        cost={{
          tier: 5,
          isHighCost: true,
          inputText: '$10.00 / 1M input',
          outputText: '$30.00 / 1M output',
        }}
        labels={labels}
      />,
    );
    expect(screen.getByText('High Cost')).toBeInTheDocument();
  });

  it('omits the "High Cost" chip when the cost is not flagged high-cost', () => {
    render(
      <ModelInfoTooltipCard
        icon={<span />}
        label="My Spec"
        cost={{
          tier: 4,
          isHighCost: false,
          inputText: '$5.00 / 1M input',
          outputText: '$15.00 / 1M output',
        }}
        labels={labels}
      />,
    );
    expect(screen.queryByText('High Cost')).not.toBeInTheDocument();
  });

  it('renders context as plain text with no meter, top-aligned with its label', () => {
    render(
      <ModelInfoTooltipCard icon={<span />} label="My Spec" contextLabel="128K" labels={labels} />,
    );
    expect(screen.getByText('128K')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Context').parentElement).toHaveClass('items-start');
  });

  it('renders a supports row listing every given capability', () => {
    render(
      <ModelInfoTooltipCard
        icon={<span />}
        label="My Spec"
        supports={['Web search', 'Image generation']}
        labels={labels}
      />,
    );
    expect(screen.getByText('Supports')).toBeInTheDocument();
    expect(screen.getByText('Web search')).toBeInTheDocument();
    expect(screen.getByText('Image generation')).toBeInTheDocument();
  });

  it('omits the supports row entirely when supports is empty', () => {
    render(<ModelInfoTooltipCard icon={<span />} label="My Spec" supports={[]} labels={labels} />);
    expect(screen.queryByText('Supports')).not.toBeInTheDocument();
  });
});
