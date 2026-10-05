// Deloitte Custom Change: tests
import React from 'react';
import { renderHook } from '@testing-library/react';
import type { SearchResultData } from 'librechat-data-provider';
import { useCompositeCitations } from '~/components/Web/Context';
import { SearchContext } from '~/Providers';

function withSearchResults(searchResults: Record<string, SearchResultData>) {
  return ({ children }: { children: React.ReactNode }) => (
    <SearchContext.Provider value={{ searchResults }}>{children}</SearchContext.Provider>
  );
}

describe('useCompositeCitations', () => {
  it('collapses multiple refs that resolve to the same link into one entry', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            title: 'Title',
            link: 'https://my.ibisworld.com/au/en/56162/at-a-glance',
            toolName: 'ibisworld_report_sections',
            serverName: 'ibisworld',
            snippet: 'Report title.',
            attribution: 'IBISWorld',
            type: 'mcp',
          },
          {
            title: 'Definition',
            link: 'https://my.ibisworld.com/au/en/56162/at-a-glance',
            toolName: 'ibisworld_report_sections',
            serverName: 'ibisworld',
            snippet: 'Report definition.',
            attribution: 'IBISWorld',
            type: 'mcp',
          },
          {
            title: 'Outlook Analysis',
            link: 'https://my.ibisworld.com/au/en/56162/at-a-glance',
            toolName: 'ibisworld_report_sections',
            serverName: 'ibisworld',
            snippet: 'Report outlook.',
            attribution: 'IBISWorld',
            type: 'mcp',
          },
        ],
      },
    };

    const { result } = renderHook(
      () =>
        useCompositeCitations([
          { turn: 0, refType: 'mcp', index: 0 },
          { turn: 0, refType: 'mcp', index: 1 },
          { turn: 0, refType: 'mcp', index: 2 },
        ]),
      { wrapper: withSearchResults(searchResults) },
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].title).toBe('Title');
  });

  it('preserves every ref citationId when duplicate sources collapse into one chip', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            title: 'Title',
            link: 'https://my.ibisworld.com/au/en/56162/at-a-glance',
            toolName: 'ibisworld_report_sections',
            serverName: 'ibisworld',
            snippet: 'Report title.',
            attribution: 'IBISWorld',
            type: 'mcp',
          },
          {
            title: 'Definition',
            link: 'https://my.ibisworld.com/au/en/56162/at-a-glance',
            toolName: 'ibisworld_report_sections',
            serverName: 'ibisworld',
            snippet: 'Report definition.',
            attribution: 'IBISWorld',
            type: 'mcp',
          },
        ],
      },
    };

    const { result } = renderHook(
      () =>
        useCompositeCitations([
          { turn: 0, refType: 'mcp', index: 0, citationId: 'standalone-0-0' },
          { turn: 0, refType: 'mcp', index: 1, citationId: 'standalone-1-10' },
        ]),
      { wrapper: withSearchResults(searchResults) },
    );

    expect(result.current).toHaveLength(1);
    // the single rendered chip must still publish both spans' ids, not just the first
    expect(result.current[0].citationIds).toEqual(['standalone-0-0', 'standalone-1-10']);
  });

  it('keeps refs with distinct links separate, in original order', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            title: 'Report A',
            link: 'https://my.ibisworld.com/au/en/1/at-a-glance',
            toolName: 'ibisworld_report_sections',
            serverName: 'ibisworld',
            snippet: 'Report A.',
            attribution: 'IBISWorld',
            type: 'mcp',
          },
          {
            title: 'Report B',
            link: 'https://my.ibisworld.com/au/en/2/at-a-glance',
            toolName: 'ibisworld_report_sections',
            serverName: 'ibisworld',
            snippet: 'Report B.',
            attribution: 'IBISWorld',
            type: 'mcp',
          },
        ],
      },
    };

    const { result } = renderHook(
      () =>
        useCompositeCitations([
          { turn: 0, refType: 'mcp', index: 0 },
          { turn: 0, refType: 'mcp', index: 1 },
        ]),
      { wrapper: withSearchResults(searchResults) },
    );

    expect(result.current).toHaveLength(2);
    expect(result.current.map((source) => source.title)).toEqual(['Report A', 'Report B']);
  });

  it('collapses refs with no link by shared fileId', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        references: [
          {
            title: 'Doc.pdf',
            link: '',
            type: 'file',
            fileId: 'file-123',
            attribution: 'Doc.pdf',
          },
          {
            title: 'Doc.pdf',
            link: '',
            type: 'file',
            fileId: 'file-123',
            attribution: 'Doc.pdf',
          },
        ],
      },
    };

    const { result } = renderHook(
      () =>
        useCompositeCitations([
          { turn: 0, refType: 'file', index: 0 },
          { turn: 0, refType: 'file', index: 1 },
        ]),
      { wrapper: withSearchResults(searchResults) },
    );

    expect(result.current).toHaveLength(1);
  });

  it('keeps distinct MCP sources separate when they share a synthetic placeholder link', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            title: 'Entity A',
            link: '#mcp-desc-search_entities',
            toolName: 'search_entities',
            serverName: 'desc',
            snippet: 'Entity A details.',
            attribution: 'desc',
            type: 'mcp',
          },
          {
            title: 'Entity B',
            link: '#mcp-desc-search_entities',
            toolName: 'search_entities',
            serverName: 'desc',
            snippet: 'Entity B details.',
            attribution: 'desc',
            type: 'mcp',
          },
        ],
      },
    };

    const { result } = renderHook(
      () =>
        useCompositeCitations([
          { turn: 0, refType: 'mcp', index: 0 },
          { turn: 0, refType: 'mcp', index: 1 },
        ]),
      { wrapper: withSearchResults(searchResults) },
    );

    expect(result.current).toHaveLength(2);
    expect(result.current.map((source) => source.title)).toEqual(['Entity A', 'Entity B']);
  });

  it('keeps distinct MCP sources separate when they share both a synthetic link and a title', () => {
    const searchResults: Record<string, SearchResultData> = {
      '0': {
        mcp_results: [
          {
            title: 'Entity',
            link: '#mcp-desc-search_entities',
            toolName: 'search_entities',
            serverName: 'desc',
            snippet: 'First entity.',
            attribution: 'desc',
            type: 'mcp',
          },
          {
            title: 'Entity',
            link: '#mcp-desc-search_entities',
            toolName: 'search_entities',
            serverName: 'desc',
            snippet: 'Second entity.',
            attribution: 'desc',
            type: 'mcp',
          },
        ],
      },
    };

    const { result } = renderHook(
      () =>
        useCompositeCitations([
          { turn: 0, refType: 'mcp', index: 0 },
          { turn: 0, refType: 'mcp', index: 1 },
        ]),
      { wrapper: withSearchResults(searchResults) },
    );

    expect(result.current).toHaveLength(2);
    expect(result.current.map((source) => source.snippet)).toEqual([
      'First entity.',
      'Second entity.',
    ]);
  });
});
