// Deloitte Custom Change: tests
import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, screen } from '@testing-library/react';
import type { MCPServerTooltipContent } from '@librechat/client';
import type { MCPOptions } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import MCPServerTooltip, { MCPServerHoverGroup } from './MCPServerTooltip';

const mockUseMCPToolsetsQuery = jest.fn();

jest.mock('~/data-provider', () => ({
  useMCPToolsetsQuery: () => mockUseMCPToolsetsQuery(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  MCPIcon: () => <svg />,
  MCPServerHoverGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MCPServerHoverTarget: ({
    content,
    children,
  }: {
    content: MCPServerTooltipContent;
    children: React.ReactNode;
  }) => (
    <>
      {children}
      <div>
        <span>{content.description}</span>
        {content.limitedAccess && <span>{content.labels.limitedAccess}</span>}
        {content.details && (
          <>
            <span>{content.labels.useCases}</span>
            <span>{content.labels.access}</span>
            <span>{content.labels.limitation}</span>
            {[
              ...content.details.useCases,
              ...content.details.access,
              ...content.details.limitations,
            ].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </>
        )}
      </div>
    </>
  ),
}));

const makeServer = (
  serverName: string,
  configOverrides: Partial<MCPOptions> = {},
  toolsetName: string | null = null,
): MCPServerDefinition => ({
  serverName,
  config: { type: 'stdio', command: 'noop', ...configOverrides } as MCPOptions,
  effectivePermissions: 1,
  toolsetName,
});

describe('MCPServerTooltip', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts the toolsets query when the group mounts, before any card renders', () => {
    mockUseMCPToolsetsQuery.mockReturnValue({ data: undefined });

    render(
      <MCPServerHoverGroup>
        <div />
      </MCPServerHoverGroup>,
    );

    expect(mockUseMCPToolsetsQuery).toHaveBeenCalledTimes(1);
  });

  it('renders the full tooltip when the gateway returns toolset details', () => {
    mockUseMCPToolsetsQuery.mockReturnValue({
      data: {
        toolsets: [
          {
            name: 'sharepoint',
            description: 'Internal sharepoint toolset',
            userFriendlyDescription: 'Search and summarize Sharepoint documents.',
            useCases: ['Find files by keyword'],
            access: ['All Deloitte Sharepoint'],
            limitations: ['Private Sharepoint folders'],
          },
        ],
      },
    });
    const server = makeServer('sharepoint', { type: 'streamable-http' }, 'sharepoint');

    render(<MCPServerTooltip trigger={<button aria-label="trigger" />} server={server} />);

    expect(screen.getByText('Search and summarize Sharepoint documents.')).toBeInTheDocument();
    expect(screen.getByText('Find files by keyword')).toBeInTheDocument();
    expect(screen.getByText('All Deloitte Sharepoint')).toBeInTheDocument();
    expect(screen.getByText('Private Sharepoint folders')).toBeInTheDocument();
  });

  it('renders a minimal tooltip when the configured toolset is missing from the response', () => {
    mockUseMCPToolsetsQuery.mockReturnValue({ data: { toolsets: [] } });
    const server = makeServer(
      'sharepoint',
      { type: 'streamable-http', description: 'Fallback description from config' },
      'sharepoint',
    );

    render(<MCPServerTooltip trigger={<button aria-label="trigger" />} server={server} />);

    expect(screen.getByText('Fallback description from config')).toBeInTheDocument();
    expect(screen.queryByText('Find files by keyword')).not.toBeInTheDocument();
    expect(screen.queryByText('com_nav_mcp_tooltip_use_cases')).not.toBeInTheDocument();
  });

  it('renders a minimal tooltip with no description when the query fails and the server has none configured', () => {
    mockUseMCPToolsetsQuery.mockReturnValue({ data: undefined });
    const server = makeServer('sharepoint', { type: 'streamable-http' }, 'sharepoint');

    render(<MCPServerTooltip trigger={<button aria-label="trigger" />} server={server} />);

    expect(screen.queryByText('com_nav_mcp_tooltip_use_cases')).not.toBeInTheDocument();
    expect(screen.queryByText('com_nav_mcp_tooltip_access')).not.toBeInTheDocument();
    expect(screen.queryByText('com_nav_mcp_tooltip_limitation')).not.toBeInTheDocument();
  });
});
