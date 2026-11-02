import { buildMCPResultSources } from './sources';

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AFR News</title>
    <item>
      <title><![CDATA[RBA holds cash rate steady]]></title>
      <link>https://www.afr.com/rba-holds-rate</link>
      <description><![CDATA[<p>The Reserve Bank held the cash rate steady, citing <b>stable</b> inflation.</p>]]></description>
      <pubDate>Thu, 03 Sep 2026 12:00:00 +0000</pubDate>
    </item>
    <item>
      <title><![CDATA[Iron ore prices jump]]></title>
      <link>https://www.afr.com/iron-ore-jump</link>
      <description><![CDATA[Shares in the mining sector rallied on the news.]]></description>
      <updated>2026-09-04T12:00:00Z</updated>
    </item>
    <item>
      <title><![CDATA[Market update]]></title>
      <link>https://www.afr.com/market-update</link>
      <description><![CDATA[The market closed higher.]]></description>
      <pubDate>not a date</pubDate>
      <updated>2026-09-05T12:00:00Z</updated>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <entry>
    <title>First entry</title>
    <link rel="alternate" href="https://example.com/first" />
    <summary>Summary of the first entry.</summary>
    <published>2026-09-03T12:00:00Z</published>
    <updated>2026-09-04T12:00:00Z</updated>
  </entry>
  <entry>
    <title>Second entry</title>
    <link href="https://example.com/second" />
    <content>Body of the second entry.</content>
    <updated>2026-09-05T12:00:00Z</updated>
  </entry>
  <entry>
    <title>Third entry</title>
    <link href="https://example.com/third" />
    <summary>Summary of the third entry.</summary>
    <published>not a date</published>
    <updated>2026-09-06T12:00:00Z</updated>
  </entry>
</feed>`;

describe('buildMCPResultSources', () => {
  it('splits an RSS feed into one source per article with title, link, and clean content', () => {
    const result = buildMCPResultSources({
      toolName: 'afr_get_latest_news',
      serverName: 'afr',
      content: RSS_FEED,
    });

    expect(result.sources).toHaveLength(3);
    expect(result.sources[0]).toMatchObject({
      toolName: 'afr_get_latest_news',
      serverName: 'afr',
      title: 'RBA holds cash rate steady',
      link: 'https://www.afr.com/rba-holds-rate',
    });
    expect(result.sources[0].content).toContain('RBA holds cash rate steady');
    expect(result.sources[0].content).toContain('stable');
    expect(result.sources[0].content).not.toContain('<b>');
    expect(result.sources[0].date).toBe('03 Sep 2026');
    expect(result.sources[1]).toMatchObject({
      title: 'Iron ore prices jump',
      link: 'https://www.afr.com/iron-ore-jump',
    });
    expect(result.sources[1].date).toBe('04 Sep 2026');
    expect(result.sources[2].date).toBe('05 Sep 2026');
  });

  it('splits an Atom feed into one source per entry, preferring the alternate link', () => {
    const result = buildMCPResultSources({
      toolName: 'get_feed',
      serverName: 'example',
      content: ATOM_FEED,
    });

    expect(result.sources).toHaveLength(3);
    expect(result.sources[0]).toMatchObject({
      title: 'First entry',
      link: 'https://example.com/first',
    });
    expect(result.sources[1]).toMatchObject({
      title: 'Second entry',
      link: 'https://example.com/second',
    });
    expect(result.sources[2]).toMatchObject({
      title: 'Third entry',
      link: 'https://example.com/third',
    });
  });

  // Deloitte Custom Change: verify Atom entries surface a date too, preferring `published` over `updated`.
  it('dates Atom entries from published, falling back to updated when it is missing or invalid', () => {
    const result = buildMCPResultSources({
      toolName: 'get_feed',
      serverName: 'example',
      content: ATOM_FEED,
    });

    expect(result.sources[0].date).toBe('03 Sep 2026');
    expect(result.sources[1].date).toBe('05 Sep 2026');
    expect(result.sources[2].date).toBe('06 Sep 2026');
  });

  it('falls back to a single source for plain-text content', () => {
    const content = 'The current weather in Sydney is sunny with a high of 24C.';
    const result = buildMCPResultSources({
      toolName: 'get_weather',
      serverName: 'weather',
      content,
    });

    expect(result.sources).toEqual([{ toolName: 'get_weather', serverName: 'weather', content }]);
  });

  it('falls back to a single source for malformed XML that merely looks like a feed', () => {
    const content = '<rss><channel><item><title>Unterminated';
    const result = buildMCPResultSources({
      toolName: 'broken_feed',
      serverName: 'broken',
      content,
    });

    expect(result.sources).toEqual([{ toolName: 'broken_feed', serverName: 'broken', content }]);
  });

  it('falls back to a single source when the feed has no usable items', () => {
    const content = '<rss version="2.0"><channel><title>Empty</title></channel></rss>';
    const result = buildMCPResultSources({ toolName: 'empty_feed', serverName: 'empty', content });

    expect(result.sources).toEqual([{ toolName: 'empty_feed', serverName: 'empty', content }]);
  });

  it('splits a Sections report payload (e.g. IBISWorld) into one source per section', () => {
    const content = JSON.stringify({
      Sections: [
        {
          RequestedSection: 'executivesummaryanalysis',
          StatusCode: 200,
          Body: { ExecutiveSummaryAnalysis: { PlainText: 'Gold prices have risen sharply.' } },
        },
      ],
    });
    const result = buildMCPResultSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      title: 'Executive Summary Analysis',
    });
    expect(result.sources[0].content).toContain('Gold prices have risen sharply.');
  });

  // Deloitte Custom Change: verify the new `args` param is threaded through to buildReportSources.
  it('forwards args through to buildReportSources so a Sections report gets a link', () => {
    const content = JSON.stringify({
      Sections: [
        {
          RequestedSection: 'executivesummaryanalysis',
          StatusCode: 200,
          Body: { ExecutiveSummaryAnalysis: { PlainText: 'Gold prices have risen sharply.' } },
        },
      ],
    });
    const result = buildMCPResultSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content,
      args: { code: '56162', country: 'AU' },
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].link).toBe(
      'https://my.ibisworld.com/au/en/industry-specialized/56162/at-a-glance',
    );
  });

  // Deloitte Custom Change: verify the new report-list array payload handling, per-report links and dates.
  it('splits an ibisworld_list_reports payload into dated, linked sources', () => {
    const content = JSON.stringify([
      {
        Code: '56162',
        Title: 'Gold Ore Mining',
        Country: 'AU',
        LastApprovedDate: '2026-06-24T00:00:00',
      },
      { Code: '11111', Title: 'Test Report', Country: 'US' },
    ]);
    const result = buildMCPResultSources({
      toolName: 'ibisworld_list_reports',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toMatchObject({
      title: 'Gold Ore Mining',
      link: 'https://my.ibisworld.com/au/en/industry-specialized/56162/at-a-glance',
      date: '24 Jun 2026',
    });
  });

  // Deloitte Custom Change: verify DESC/GIMS entity payloads are routed through buildEntitySources.
  it('cites a DESC/GIMS entity that only has an entityID', () => {
    const content = JSON.stringify({
      statusCode: 200,
      message: 'Result Model.',
      data: { entityID: 999001 },
    });
    const result = buildMCPResultSources({
      toolName: 'desc_get_entity_by_id',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ title: 'Entity 999001' });
  });

  it('surfaces the KX disclaimer alongside its sources', () => {
    const content = JSON.stringify({
      usage_guidelines: 'Please review accuracy of all the responses before reusing them.',
      actualresults: [
        {
          title: 'Assistance with AI Governance and Responsible AI Ecosystem',
          description: 'Deloitte helped establish an AI Governance practice.',
          appurl: 'https://stagequals.deloitteresources.com/quals/view/139514/description/',
        },
      ],
    });
    const result = buildMCPResultSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.disclaimer).toBe(
      'Please review accuracy of all the responses before reusing them.',
    );
  });

  it('suppresses citation entirely for a known-toolset error response instead of dumping raw text', () => {
    const content =
      'REST API returned 422: {"detail":[{"type":"bool_type","loc":["body","overridesettings","only_searchresults"]}]}';
    const result = buildMCPResultSources({
      toolName: 'kx_query',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toEqual([]);
  });

  it('suppresses citation entirely for unrecognized JSON from a known toolset (e.g. DESC/GIMS)', () => {
    const result = buildMCPResultSources({
      toolName: 'desc_search_entities',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({ statusCode: 500, message: 'Internal error' }),
    });

    expect(result.sources).toEqual([]);
  });

  it('suppresses citation entirely for malformed feed XML from the AFR toolset', () => {
    const content = '<rss><channel><item><title>Unterminated';
    const result = buildMCPResultSources({
      toolName: 'afr_get_latest_news',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toEqual([]);
  });

  it('splits an sp_search response (SharePoint) into one source per hit', () => {
    const content = JSON.stringify({
      results: [
        {
          rank: 1,
          summary: 'Q3 budget summary for the finance team.',
          resource: {
            name: 'Q3 Budget.xlsx',
            webUrl: 'https://contoso.sharepoint.com/sites/finance/Q3%20Budget.xlsx',
          },
        },
      ],
      total: 1,
    });
    const result = buildMCPResultSources({
      toolName: 'sp_search',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      toolName: 'sp_search',
      serverName: 'cleartrack-mcp-gateway',
      title: 'Q3 Budget.xlsx',
      link: 'https://contoso.sharepoint.com/sites/finance/Q3%20Budget.xlsx',
    });
  });

  it('splits an sp_list_items response (SharePoint) into one source per item', () => {
    const content = JSON.stringify({
      items: [
        {
          id: '1',
          name: 'Report.pdf',
          type: 'file',
          webUrl: 'https://contoso.sharepoint.com/sites/finance/Report.pdf',
        },
      ],
      count: 1,
    });
    const result = buildMCPResultSources({
      toolName: 'sp_list_items',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ title: 'Report.pdf' });
  });

  it('suppresses citation entirely for unrecognized JSON from the SharePoint toolset', () => {
    const result = buildMCPResultSources({
      toolName: 'sp_get_item',
      serverName: 'cleartrack-mcp-gateway',
      content: JSON.stringify({ statusCode: 500, message: 'Internal error' }),
    });

    expect(result.sources).toEqual([]);
  });

  it('does not reclassify a non-SharePoint tool result that happens to share a SharePoint payload shape', () => {
    const content = JSON.stringify({
      items: [
        {
          id: '1',
          name: 'Report.pdf',
          webUrl: 'https://contoso.sharepoint.com/sites/finance/Report.pdf',
        },
      ],
      count: 1,
    });
    const result = buildMCPResultSources({
      toolName: 'some_other_tool',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(result.sources).toEqual([
      { toolName: 'some_other_tool', serverName: 'cleartrack-mcp-gateway', content },
    ]);
  });
});
