// Deloitte Custom Change: tests
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SearchResultData } from 'librechat-data-provider';
import { Citation, CompositeCitation } from '~/components/Web/Citation';
import { CitationContext } from '~/components/Web/Context';
import { SearchContext } from '~/Providers';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: { label?: string; pages?: string }) => {
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
    return key;
  },
  useMCPServerTitleMap: () => new Map<string, string>([['kx', 'KX']]),
}));

jest.mock('~/components/Chat/Messages/Content/FilePreviewDialog', () => ({
  __esModule: true,
  default: ({ open, fileId, fileName }: { open: boolean; fileId?: string; fileName: string }) =>
    open ? (
      <div data-testid="file-preview-dialog" data-file-id={fileId}>
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
          hoveredCitationId: null,
          setHoveredCitationId: jest.fn(),
        }}
      >
        {children}
      </CitationContext.Provider>
    </SearchContext.Provider>,
  );
}

describe('Citation', () => {
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
});
