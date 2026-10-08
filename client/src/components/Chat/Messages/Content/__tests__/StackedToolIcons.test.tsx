import { Constants } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import StackedToolIcons from '../ToolOutput/StackedToolIcons';

jest.mock('~/hooks/MCP', () => ({
  useMCPServerNames: () => ['weather'],
}));

describe('shared header glyphs', () => {
  it('keeps MCP identity alongside a subagent and owned search sites', () => {
    const { container } = render(
      <StackedToolIcons
        toolNames={[
          `forecast${Constants.mcp_delimiter}weather`,
          `conditions${Constants.mcp_delimiter}weather`,
          String(Constants.SUBAGENT),
          'web_search',
        ]}
        mcpIconMap={new Map([['weather', 'https://example.com/weather.svg']])}
        sourceDomains={['source.example']}
        maxIcons={4}
      />,
    );
    const images = Array.from(container.querySelectorAll('img'));
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://example.com/weather.svg');
    // Deloitte Custom Change: favicon images are decorative (alt="") since the
    // domain is always shown as adjacent visible text; the domain now lives in
    // the favicon URL's `domain` query param instead of `alt`.
    expect(images[1]).toHaveAttribute('alt', '');
    expect(new URL(images[1].getAttribute('src') ?? '').searchParams.get('domain')).toBe(
      'source.example',
    );
    expect(container.querySelector('.lucide-users')).not.toBeNull();
    expect(container.querySelector('.lucide-globe')).toBeNull();
  });

  it.each(['failed', 'cancelled'] as const)(
    'lets %s replace identity without animating',
    (status) => {
      const { container } = render(
        <StackedToolIcons
          toolNames={['web_search']}
          sourceDomains={['source.example']}
          status={status}
          isAnimating
        />,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('.animate-pulse')).toBeNull();
      expect(
        container.querySelector(status === 'failed' ? '.lucide-triangle-alert' : '.lucide-x'),
      ).not.toBeNull();
    },
  );

  it.each([
    ['create_file', 'lucide-file-plus-2'],
    ['edit_file', 'lucide-file-pen-line'],
  ])('renders %s with the same glyph as its file row', (name, glyph) => {
    const { container } = render(<StackedToolIcons toolNames={[name]} />);
    expect(container.querySelector(`.${glyph}`)).not.toBeNull();
    expect(container.querySelector('.lucide-wrench')).toBeNull();
  });

  it('retains a bounded stack and overflow count', () => {
    const { container } = render(
      <StackedToolIcons
        toolNames={['web_search', 'read_file']}
        sourceDomains={['one.example', 'two.example']}
        maxIcons={2}
      />,
    );
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});
