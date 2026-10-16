import { render, screen } from '@testing-library/react';
import type { MCPServerTooltipContent } from '../MCPServerTooltip';
import { MCPServerTooltipCard } from '../MCPServerTooltip';

const content: MCPServerTooltipContent = {
  icon: <svg data-testid="icon" />,
  name: 'SharePoint',
  limitedAccess: true,
  description: 'Search documents.',
  details: {
    useCases: ['Find files'],
    access: ['All sites'],
    limitations: ['Private folders'],
  },
  labels: {
    connector: 'Connector',
    limitedAccess: 'Limited access',
    useCases: 'Use cases',
    access: 'Access',
    limitation: 'Limitation',
  },
};

describe('MCPServerTooltipCard', () => {
  it('renders identity, access tier and toolset details', () => {
    render(<MCPServerTooltipCard {...content} />);

    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('Connector')).toBeInTheDocument();
    expect(screen.getByText('SharePoint')).toBeInTheDocument();
    expect(screen.getByText('Limited access')).toBeInTheDocument();
    expect(screen.getByText('Search documents.')).toBeInTheDocument();
    expect(screen.getByText('Find files')).toBeInTheDocument();
    expect(screen.getByText('All sites')).toBeInTheDocument();
    expect(screen.getByText('Private folders')).toBeInTheDocument();
  });

  it('exposes the card as a labelled region carrying the id used by aria-describedby', () => {
    render(<MCPServerTooltipCard {...content} id="card-1" />);

    const region = screen.getByRole('region', { name: 'SharePoint' });
    expect(region).toHaveAttribute('id', 'card-1');
  });

  it('omits the details section and access tag when not provided', () => {
    render(<MCPServerTooltipCard {...content} limitedAccess={false} details={undefined} />);

    expect(screen.queryByText('Limited access')).not.toBeInTheDocument();
    expect(screen.queryByText('Use cases')).not.toBeInTheDocument();
  });
});
