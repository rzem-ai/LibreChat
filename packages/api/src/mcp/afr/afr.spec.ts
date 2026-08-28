import { buildAfrSearchSources } from './afr';

describe('buildAfrSearchSources', () => {
  it('splits an AFR semantic-search payload into one source per article', () => {
    const content = JSON.stringify({
      query: 'forestry industry latest developments',
      start_date: '2025-08-24',
      end_date: '2026-08-24',
      count: 2,
      results: [
        {
          title: "Native forest carbon credits aren't counting real climate benefits",
          snippet: 'Allowing low-integrity credits into the scheme risks damaging confidence.',
          score: 0.5148,
          publisher: 'Australian Financial Review',
          author: 'Michelle Freeman',
          published: '12 August 2026, 01:13PM',
          view_url:
            'https://www.afr.com/policy/energy-and-climate/native-forest-carbon-credits-aren-t-counting-real-climate-benefits-20260810-p60mze',
        },
        {
          title: 'Ending native forest harvesting for carbon credits is madness',
          snippet: 'If Australia chooses not to produce the wood it needs, demand shifts overseas.',
          view_url: 'https://www.afr.com/policy/energy-and-climate/ending-native-forest-harvesting',
        },
      ],
    });

    const result = buildAfrSearchSources({
      toolName: 'afr_search_news',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources).toHaveLength(2);
    expect(result?.sources[0]).toMatchObject({
      toolName: 'afr_search_news',
      serverName: 'cleartrack-mcp-gateway',
      title: "Native forest carbon credits aren't counting real climate benefits",
      link: 'https://www.afr.com/policy/energy-and-climate/native-forest-carbon-credits-aren-t-counting-real-climate-benefits-20260810-p60mze',
    });
    expect(result?.sources[0].content).toBe(
      "Native forest carbon credits aren't counting real climate benefits\n\nAllowing low-integrity credits into the scheme risks damaging confidence.",
    );
  });

  it('skips title-less results', () => {
    const content = JSON.stringify({
      results: [{ snippet: 'No title on this one.', view_url: 'https://www.afr.com/x' }],
    });

    const result = buildAfrSearchSources({
      toolName: 'afr_search_news',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for JSON that is not an AFR search payload', () => {
    const result = buildAfrSearchSources({
      toolName: 'get_weather',
      serverName: 'weather',
      content: JSON.stringify({ temperature: 24, condition: 'sunny' }),
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for a non-JSON error response', () => {
    const result = buildAfrSearchSources({
      toolName: 'afr_search_news',
      serverName: 'cleartrack-mcp-gateway',
      content: 'Error: [MCP][cleartrack-mcp-gateway][afr_search_news] tool call failed: timed out',
    });

    expect(result).toBeUndefined();
  });
});
