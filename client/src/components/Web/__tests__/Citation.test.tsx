// Deloitte Custom Change: tests
import React, { useState, useCallback } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SearchResultData } from 'librechat-data-provider';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import { CitationContext } from '~/components/Web/Context';
import { SearchContext } from '~/Providers';

/**
 * A real, stateful provider (unlike `renderWithProviders`' static mock) — used to prove the
 * hover-highlight wiring itself works end to end, mirroring how `ContentParts` mounts it.
 */
function StatefulCitationProvider({ children }: { children: React.ReactNode }) {
  const [hoveredCitationIds, setHoveredCitationIdsState] = useState<Set<string> | null>(null);
  const setHoveredCitationIds = useCallback(
    (ids: Array<string> | null) =>
      setHoveredCitationIdsState(ids && ids.length > 0 ? new Set(ids) : null),
    [],
  );
  return (
    <CitationContext.Provider value={{ hoveredCitationIds, setHoveredCitationIds }}>
      {children}
    </CitationContext.Provider>
  );
}

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: { label?: string; pages?: string; date?: string }) => {
    if (key === 'com_citation_source') {
      return 'Source';
    }
    if (key === 'com_citation_more_details') {
      return `More details about ${values?.label ?? ''}`;
    }
    if (key === 'com_ui_relevance') {
      return 'Relevance';
    }
    if (key === 'com_file_pages') {
      return `Pages: ${values?.pages ?? ''}`;
    }
    if (key === 'com_file_source') {
      return 'File source';
    }
    if (key === 'com_ui_tool_name_file_search') {
      return 'File Search';
    }
    // Deloitte Custom Change: citation date labels
    if (key === 'com_citation_published') {
      return `Published: ${values?.date ?? ''}`;
    }
    if (key === 'com_citation_uploaded') {
      return `Uploaded: ${values?.date ?? ''}`;
    }
    return key;
  },
  useMCPServerMaps: () => ({
    titleMap: new Map<string, string>([
      ['kx', 'KX'],
      ['KX_Connector', 'KX Connector Display Name'],
    ]),
    iconMap: new Map<string, string>([
      ['kx', 'https://cdn.example.com/kx-icon.png'],
      ['KX_Connector', 'https://cdn.example.com/kx-connector-icon.png'],
    ]),
  }),
}));

jest.mock('~/components/Chat/Messages/Content/FilePreviewDialog', () => ({
  __esModule: true,
  default: ({
    open,
    fileId,
    fileName,
    fileSource,
  }: {
    open: boolean;
    fileId?: string;
    fileName: string;
    fileSource?: string;
  }) =>
    open ? (
      <div data-testid="file-preview-dialog" data-file-id={fileId} data-file-source={fileSource}>
        {fileName}
      </div>
    ) : null,
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

function renderWithProviders(
  children: React.ReactNode,
  searchResults: Record<string, SearchResultData>,
) {
  return render(
    <SearchContext.Provider value={{ searchResults }}>
      <CitationContext.Provider
        value={{
          hoveredCitationIds: null,
          setHoveredCitationIds: jest.fn(),
        }}
      >
        {children}
      </CitationContext.Provider>
    </SearchContext.Provider>,
  );
}

describe('Citation', () => {
  it('uses the semantic active surface for a highlighted passage', () => {
    const highlightedPassage = 'Highlighted passage';
    render(
      // Deloitte Custom Change: CitationContext now tracks a Set of hovered
      // citation ids (hoveredCitationIds/setHoveredCitationIds) instead of a
      // single hoveredCitationId, to support highlighting multiple citations
      // that share the same quoted span.
      <CitationContext.Provider
        value={{
          hoveredCitationIds: new Set(['cite-highlight']),
          setHoveredCitationIds: jest.fn(),
        }}
      >
        <HighlightedText citationId="cite-highlight">{highlightedPassage}</HighlightedText>
      </CitationContext.Provider>,
    );

    expect(screen.getByText(highlightedPassage)).toHaveClass('bg-surface-active');
  });

  it('renders composite file citations as buttons and opens the preview dialog', () => {
    const searchResults = {
      '0': {
        references: [
          {
            attribution: 'Tutorial Imazing.pdf',
            fileId: 'file-123',
            fileName: 'Tutorial Imazing.pdf',
            link: '#file-123',
            metadata: {
              fileBytes: 2048,
              fileType: 'application/pdf',
              storageType: 'text',
            },
            pageRelevance: { 1: 0.92 },
            pages: [1],
            relevance: 0.92,
            title: 'Tutorial Imazing.pdf',
            type: 'file',
          },
        ],
      },
    };

    renderWithProviders(
      <CompositeCitation
        node={{
          properties: {
            citationId: 'cite-1',
            citations: [{ turn: 0, refType: 'file', index: 0 }],
          },
        }}
      />,
      searchResults as any,
    );

    const fileButton = screen.getByRole('button', { name: 'Tutorial I...' });

    expect(fileButton).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tutorial Imazing.pdf' })).not.toBeInTheDocument();

    fireEvent.click(fileButton);

    expect(screen.getByTestId('file-preview-dialog')).toHaveAttribute('data-file-id', 'file-123');
    expect(screen.getByTestId('file-preview-dialog')).toHaveAttribute('data-file-source', 'text');
  });

  it('keeps standalone web citations as links', () => {
    const searchResults = {
      '0': {
        organic: [
          {
            attribution: 'example.com',
            link: 'https://example.com',
            snippet: 'Example snippet',
            title: 'Example',
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-2"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'search', index: 0 },
            citationId: 'cite-2',
          },
        }}
      />,
      searchResults as any,
    );

    expect(screen.getByRole('link', { name: 'example.com' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });

  it('resolves the MCP citation chip label from the configured server title', () => {
    const searchResults = {
      '0': {
        mcp_results: [
          {
            attribution: 'kx',
            link: 'https://stagequals.deloitteresources.com/quals/view/1/description/',
            serverName: 'kx',
            snippet: 'Qualification summary text.',
            title: 'Digital Twin Implementation',
            toolName: 'kx_query',
            type: 'mcp',
            usageRestriction: true,
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-3"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-3',
          },
        }}
      />,
      searchResults as any,
    );

    const chip = screen.getByRole('button', { name: 'KX' });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('title', 'KX');
  });

  it('resolves the configured server title for a raw server name with special characters', () => {
    // Regression test: the title map is keyed by normalized server name (same
    // contract as the icon map), so a raw serverName like "KX Connector" must be
    // normalized before the title lookup, not just the icon lookup.
    const searchResults = {
      '0': {
        mcp_results: [
          {
            attribution: 'KX Connector',
            link: 'https://stagequals.deloitteresources.com/quals/view/1/description/',
            serverName: 'KX Connector',
            snippet: 'Qualification summary text.',
            title: 'Digital Twin Implementation',
            toolName: 'kx_query',
            type: 'mcp',
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-3b"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-3b',
          },
        }}
      />,
      searchResults as any,
    );

    expect(screen.getByRole('button', { name: 'KX Connector Display Name' })).toBeInTheDocument();
  });

  it('falls back to the source title when the MCP server has no configured title', () => {
    const searchResults = {
      '0': {
        mcp_results: [
          {
            attribution: 'unknown-server',
            link: 'https://example.com/article',
            serverName: 'unknown-server',
            snippet: 'Article snippet.',
            title: 'Some Article Title',
            toolName: 'afr_search_news',
            type: 'mcp',
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-4"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-4',
          },
        }}
      />,
      searchResults as any,
    );

    expect(screen.getByRole('button', { name: 'Some Article Title' })).toBeInTheDocument();
  });

  it('renders the configured server logo for an MCP citation chip', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'kx',
            link: 'https://stagequals.deloitteresources.com/quals/view/1/description/',
            serverName: 'kx',
            snippet: 'Qualification summary text.',
            title: 'Digital Twin Implementation',
            toolName: 'kx_query',
            type: 'mcp',
          },
        ],
      },
    };

    const { container } = renderWithProviders(
      <Citation
        citationId="cite-5"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-5',
          },
        }}
      />,
      searchResults,
    );

    const icon = container.querySelector('img[src="https://cdn.example.com/kx-icon.png"]');
    expect(icon).toBeInTheDocument();
  });

  it('falls back to the generic document icon when the MCP server has no configured logo', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'unknown-server',
            link: 'https://example.com/article',
            serverName: 'unknown-server',
            snippet: 'Article snippet.',
            title: 'Some Article Title',
            toolName: 'afr_search_news',
            type: 'mcp',
          },
        ],
      },
    };

    const { container } = renderWithProviders(
      <Citation
        citationId="cite-6"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-6',
          },
        }}
      />,
      searchResults,
    );

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg.lucide-file-text')).toBeInTheDocument();
  });

  it('falls back to the generic document icon after the configured logo fails to load', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'kx',
            link: 'https://stagequals.deloitteresources.com/quals/view/1/description/',
            serverName: 'kx',
            snippet: 'Qualification summary text.',
            title: 'Digital Twin Implementation',
            toolName: 'kx_query',
            type: 'mcp',
          },
        ],
      },
    };

    const { container } = renderWithProviders(
      <Citation
        citationId="cite-7"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-7',
          },
        }}
      />,
      searchResults,
    );

    const icon = container.querySelector('img[src="https://cdn.example.com/kx-icon.png"]');
    expect(icon).toBeInTheDocument();

    fireEvent.error(icon as HTMLImageElement);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg.lucide-file-text')).toBeInTheDocument();
  });

  it('renders the configured server logo for a composite MCP citation chip', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'kx',
            link: 'https://stagequals.deloitteresources.com/quals/view/1/description/',
            serverName: 'kx',
            snippet: 'Qualification summary text.',
            title: 'Digital Twin Implementation',
            toolName: 'kx_query',
            type: 'mcp',
          },
        ],
      },
    };

    renderWithProviders(
      <CompositeCitation
        node={{
          properties: {
            citationId: 'cite-8',
            citations: [{ turn: 0, refType: 'mcp', index: 0 }],
          },
        }}
      />,
      searchResults,
    );

    const chip = screen.getByRole('button', { name: 'KX' });
    expect(
      chip.querySelector('img[src="https://cdn.example.com/kx-icon.png"]'),
    ).toBeInTheDocument();
  });

  it('renders the configured server logo in the standalone MCP tooltip header', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'kx',
            link: 'https://stagequals.deloitteresources.com/quals/view/1/description/',
            serverName: 'kx',
            snippet: 'Qualification summary text.',
            title: 'Digital Twin Implementation',
            toolName: 'kx_query',
            type: 'mcp',
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-9"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-9',
          },
        }}
      />,
      searchResults,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More details about KX' }));

    const dialog = screen.getByRole('dialog');
    const icon = dialog.querySelector('img[src="https://cdn.example.com/kx-icon.png"]');
    expect(icon).toBeInTheDocument();

    fireEvent.error(icon as HTMLImageElement);

    expect(dialog.querySelector('img')).not.toBeInTheDocument();
    expect(dialog.querySelector('svg.lucide-file-text')).toBeInTheDocument();
  });

  // Deloitte Custom Change: verify the MCP tooltip surfaces a citation's own `date` field.
  it('shows the published date in the MCP tooltip when the source carries one', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'kx',
            link: 'https://stagequals.deloitteresources.com/quals/view/1/description/',
            serverName: 'kx',
            snippet: 'Qualification summary text.',
            title: 'Digital Twin Implementation',
            toolName: 'kx_query',
            type: 'mcp',
            date: '24 Jun 2026',
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-date-1"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-date-1',
          },
        }}
      />,
      searchResults,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More details about KX' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Published: 24 Jun 2026');
  });

  // Deloitte Custom Change: verify the fallback that extracts a date from a `PublishedDate:` snippet when the source has no dedicated `date` field.
  it('falls back to extracting the published date from the snippet when the source has no date field', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'ibisworld',
            link: 'https://my.ibisworld.com/au/en/industry-specialized/56162/at-a-glance',
            serverName: 'ibisworld',
            snippet:
              'Country: AU, Industry: Gold Ore Mining, PublishedDate: 2026-06-24T00:00:00, Body: ...',
            title: 'Gold Ore Mining',
            toolName: 'ibisworld_report_sections',
            type: 'mcp',
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-date-2"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-date-2',
          },
        }}
      />,
      searchResults,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More details about Gold Ore Mining' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Published: 24 Jun 2026');
  });

  it('does not extract a date from an UnpublishedDate field', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'ibisworld',
            link: 'https://my.ibisworld.com/au/en/industry-specialized/56162/at-a-glance',
            serverName: 'ibisworld',
            snippet: 'Country: AU, UnpublishedDate: 2026-06-24T00:00:00, Body: ...',
            title: 'Gold Ore Mining',
            toolName: 'ibisworld_report_sections',
            type: 'mcp',
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-date-2"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'mcp', index: 0 },
            citationId: 'cite-date-2',
          },
        }}
      />,
      searchResults,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More details about Gold Ore Mining' }));

    expect(screen.getByRole('dialog')).not.toHaveTextContent('Published: 24 Jun 2026');
  });

  // Deloitte Custom Change: verify the file_search tooltip surfaces the file's uploaded date.
  it('shows the uploaded date in the file tooltip when the file has an uploadedAt timestamp', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        references: [
          {
            attribution: 'Tutorial Imazing.pdf',
            fileId: 'file-456',
            fileName: 'Tutorial Imazing.pdf',
            link: '#file-456',
            metadata: {
              fileBytes: 2048,
              fileType: 'application/pdf',
              uploadedAt: '2025-11-06T00:00:00Z',
            },
            title: 'Tutorial Imazing.pdf',
            type: 'file',
          },
        ],
      },
    };

    renderWithProviders(
      <Citation
        citationId="cite-date-3"
        citationType="standalone"
        node={{
          properties: {
            citation: { turn: 0, refType: 'file', index: 0 },
            citationId: 'cite-date-3',
          },
        }}
      />,
      searchResults,
    );

    fireEvent.click(screen.getByRole('button', { name: /More details about/ }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Uploaded: 06 Nov 2025');
  });

  it('renders the configured server logo in the composite MCP tooltip header', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            attribution: 'kx',
            link: 'https://stagequals.deloitteresources.com/quals/view/1/description/',
            serverName: 'kx',
            snippet: 'Qualification summary text.',
            title: 'Digital Twin Implementation',
            toolName: 'kx_query',
            type: 'mcp',
          },
        ],
      },
    };

    renderWithProviders(
      <CompositeCitation
        node={{
          properties: {
            citationId: 'cite-10',
            citations: [{ turn: 0, refType: 'mcp', index: 0 }],
          },
        }}
      />,
      searchResults,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More details about KX' }));

    const dialog = screen.getByRole('dialog');
    const icon = dialog.querySelector('img[src="https://cdn.example.com/kx-icon.png"]');
    expect(icon).toBeInTheDocument();

    fireEvent.error(icon as HTMLImageElement);

    expect(dialog.querySelector('img')).not.toBeInTheDocument();
    expect(dialog.querySelector('svg.lucide-file-text')).toBeInTheDocument();
  });

  it('highlights the associated span on hover with a real stateful provider (not a static mock)', () => {
    const searchResults = {
      '0': {
        organic: [
          {
            attribution: 'example.com',
            link: 'https://example.com',
            snippet: 'Example snippet',
            title: 'Example',
          },
        ],
      },
    };

    const quotedSpanText = 'quoted span';

    render(
      <SearchContext.Provider value={{ searchResults: searchResults as any }}>
        <StatefulCitationProvider>
          <HighlightedText citationId="cite-11">{quotedSpanText}</HighlightedText>
          <Citation
            citationId="cite-11"
            citationType="standalone"
            node={{
              properties: {
                citation: { turn: 0, refType: 'search', index: 0 },
                citationId: 'cite-11',
              },
            }}
          />
        </StatefulCitationProvider>
      </SearchContext.Provider>,
    );

    const span = screen.getByText(quotedSpanText);
    const chip = screen.getByRole('link', { name: 'example.com' });

    // Deloitte Custom Change: GEL design-system semantic token (bg-surface-active)
    // replaced the literal Tailwind amber highlight color.
    expect(span).not.toHaveClass('bg-surface-active');

    fireEvent.mouseEnter(chip);
    expect(span).toHaveClass('bg-surface-active');

    fireEvent.mouseLeave(chip);
    expect(span).not.toHaveClass('bg-surface-active');
  });
});
