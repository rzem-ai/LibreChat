import '@testing-library/jest-dom';
import { ResourceCard, StatusChip, TourCard } from '..';
import { fireEvent, render, screen } from '@testing-library/react';

describe('StatusChip', () => {
  it('renders the provided label', () => {
    render(<StatusChip status="in-progress" label="60% complete" />);
    expect(screen.getByText('60% complete')).toBeInTheDocument();
  });
});

describe('TourCard', () => {
  const props = {
    title: 'Connectors',
    description: 'Connect things',
    status: 'in-progress' as const,
    statusLabel: '60% complete',
    ctaLabel: 'Continue',
  };

  it.each([false, true])('starts the tour from the CTA (hero=%s)', (hero) => {
    const onStart = jest.fn();
    render(<TourCard {...props} hero={hero} onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.getByText('60% complete')).toBeInTheDocument();
  });

  it('disables the CTA when disabled', () => {
    render(<TourCard {...props} disabled onStart={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('ResourceCard', () => {
  const base = { title: 'T', description: 'D', icon: 'Article' as const, metaLabel: 'Article' };

  it('calls onSelect for in-app resources', () => {
    const onSelect = jest.fn();
    render(<ResourceCard {...base} actionLabel="Read T" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read T' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders external resources as a new-tab noopener link', () => {
    render(
      <ResourceCard {...base} actionLabel="T (opens in a new tab)" externalHref="https://x.test" />,
    );
    const link = screen.getByRole('link', { name: 'T (opens in a new tab)' });
    expect(link).toHaveAttribute('href', 'https://x.test');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
