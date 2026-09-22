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
      date: '12 Aug 2026',
    });
    expect(result?.sources[0].content).toBe(
      "Native forest carbon credits aren't counting real climate benefits\n\nAllowing low-integrity credits into the scheme risks damaging confidence.",
    );
  });

  // Deloitte Custom Change: verify the new `date` field omits gracefully when unparseable.
  it('omits the date when `published` is missing or unparseable', () => {
    const content = JSON.stringify({
      results: [
        { title: 'No date field', view_url: 'https://www.afr.com/a' },
        { title: 'Malformed date', view_url: 'https://www.afr.com/b', published: 'not a date' },
        {
          title: 'Invalid calendar date',
          view_url: 'https://www.afr.com/c',
          published: '31 June 2026, 08:41AM',
        },
      ],
    });

    const result = buildAfrSearchSources({
      toolName: 'afr_search_news',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources[0].date).toBeUndefined();
    expect(result?.sources[1].date).toBeUndefined();
    expect(result?.sources[2].date).toBeUndefined();
  });

  it('omits the date when `published` has an invalid 12-hour clock value', () => {
    const content = JSON.stringify({
      results: [
        {
          title: 'Valid clock',
          view_url: 'https://www.afr.com/a',
          published: '12 August 2026, 12:00AM',
        },
        {
          title: 'Zero hour',
          view_url: 'https://www.afr.com/b',
          published: '12 August 2026, 00:15AM',
        },
        {
          title: 'Thirteen hour',
          view_url: 'https://www.afr.com/c',
          published: '12 August 2026, 13:15AM',
        },
        {
          title: 'Sixty minutes',
          view_url: 'https://www.afr.com/d',
          published: '12 August 2026, 11:60AM',
        },
      ],
    });

    const result = buildAfrSearchSources({
      toolName: 'afr_search_news',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result?.sources[0].date).toBe('12 Aug 2026');
    expect(result?.sources[1].date).toBeUndefined();
    expect(result?.sources[2].date).toBeUndefined();
    expect(result?.sources[3].date).toBeUndefined();
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
