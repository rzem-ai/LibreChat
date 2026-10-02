import { Tools } from 'librechat-data-provider';
import { renderHook } from '@testing-library/react';
import type { TAttachment } from 'librechat-data-provider';
import { useSearchResultsByTurn } from '~/hooks/Messages/useSearchResultsByTurn';

describe('useSearchResultsByTurn', () => {
  it('merges a web_search and a file_search attachment that both resolve to turn 0', () => {
    // web_search keys by its own explicit `turn`; file_search keys by an independent counter
    // starting at 0 for the first attachment — the same numeric turnKey can legitimately hold
    // both. A plain overwrite at either merge site would silently drop whichever was processed
    // first instead of combining them.
    const attachments = [
      {
        type: Tools.web_search,
        [Tools.web_search]: {
          turn: 0,
          organic: [{ title: 'Desk Booking', link: 'https://example.com', snippet: 'Book a desk.' }],
        },
      },
      {
        type: Tools.file_search,
        [Tools.file_search]: {
          sources: [{ fileId: 'fileA', fileName: 'policy.pdf', pages: [1], relevance: 0.9 }],
        },
      },
    ] as unknown as TAttachment[];

    const { result } = renderHook(() => useSearchResultsByTurn(attachments));

    expect(result.current['0']?.organic?.[0]).toMatchObject({ title: 'Desk Booking' });
    expect(result.current['0']?.references?.[0]).toMatchObject({ fileName: 'policy.pdf' });
  });

  it('assigns turn 0 to a lone successful MCP attachment', () => {
    const attachments = [
      {
        type: Tools.mcp_results,
        [Tools.mcp_results]: {
          sources: [
            {
              toolName: 'kx_query',
              serverName: 'cleartrack-mcp-gateway',
              title: 'Sahoo, Aditya',
              link: 'https://stage.people.deloitte/profile/adsahoo',
              content: 'Sahoo, Aditya\n\nBanking domain experience.',
            },
          ],
        },
      },
    ] as unknown as TAttachment[];

    const { result } = renderHook(() => useSearchResultsByTurn(attachments));

    expect(result.current['0']?.mcp_results?.[0]).toMatchObject({ title: 'Sahoo, Aditya' });
  });

  it('keeps turn indexing in sync with the backend when an earlier MCP call was suppressed to an empty source list', () => {
    // Mirrors buildMCPPassages in packages/api/src/agents/citations.ts, which
    // advances its turn counter for every mcp_results attachment whose
    // `sources` array is present, even when empty (e.g. a suppressed 422 from
    // a known toolset) — so a failed call ahead of a successful one must still
    // consume a turn slot on the client, or the successful call's citations
    // (anchored at turn1 by the backend) resolve against nothing.
    const attachments = [
      {
        type: Tools.mcp_results,
        [Tools.mcp_results]: { sources: [] },
      },
      {
        type: Tools.mcp_results,
        [Tools.mcp_results]: {
          sources: [
            {
              toolName: 'kx_query',
              serverName: 'cleartrack-mcp-gateway',
              title: 'Sahoo, Aditya',
              link: 'https://stage.people.deloitte/profile/adsahoo',
              content: 'Sahoo, Aditya\n\nBanking domain experience.',
            },
          ],
        },
      },
    ] as unknown as TAttachment[];

    const { result } = renderHook(() => useSearchResultsByTurn(attachments));

    expect(result.current['0']).toBeUndefined();
    expect(result.current['1']?.mcp_results?.[0]).toMatchObject({ title: 'Sahoo, Aditya' });
  });

  it('passes usageRestriction through to the mapped MCP reference', () => {
    const attachments = [
      {
        type: Tools.mcp_results,
        [Tools.mcp_results]: {
          sources: [
            {
              toolName: 'kx_query',
              serverName: 'cleartrack-mcp-gateway',
              title: 'Assistance with AI Governance',
              link: 'https://stagequals.deloitteresources.com/quals/view/139514/description/',
              content:
                'Assistance with AI Governance\n\nUsage restrictions: Requires partner approval',
              usageRestriction: true,
            },
          ],
        },
      },
    ] as unknown as TAttachment[];

    const { result } = renderHook(() => useSearchResultsByTurn(attachments));

    expect(result.current['0']?.mcp_results?.[0]).toMatchObject({ usageRestriction: true });
  });

  it('passes date through to the mapped MCP reference', () => {
    const attachments = [
      {
        type: Tools.mcp_results,
        [Tools.mcp_results]: {
          sources: [
            {
              toolName: 'kx_query',
              serverName: 'cleartrack-mcp-gateway',
              title: 'Assistance with AI Governance',
              content: 'Assistance with AI Governance\n\nSummary.',
              date: '12 Aug 2026',
            },
          ],
        },
      },
    ] as unknown as TAttachment[];

    const { result } = renderHook(() => useSearchResultsByTurn(attachments));

    expect(result.current['0']?.mcp_results?.[0]).toMatchObject({ date: '12 Aug 2026' });
  });
});
