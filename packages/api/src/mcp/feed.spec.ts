import { buildMCPResultSources } from './feed';

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AFR News</title>
    <item>
      <title><![CDATA[RBA holds cash rate steady]]></title>
      <link>https://www.afr.com/rba-holds-rate</link>
      <description><![CDATA[<p>The Reserve Bank held the cash rate steady, citing <b>stable</b> inflation.</p>]]></description>
    </item>
    <item>
      <title><![CDATA[Iron ore prices jump]]></title>
      <link>https://www.afr.com/iron-ore-jump</link>
      <description><![CDATA[Shares in the mining sector rallied on the news.]]></description>
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
  </entry>
  <entry>
    <title>Second entry</title>
    <link href="https://example.com/second" />
    <content>Body of the second entry.</content>
  </entry>
</feed>`;

describe('buildMCPResultSources', () => {
  it('splits an RSS feed into one source per article with title, link, and clean content', () => {
    const sources = buildMCPResultSources({
      toolName: 'afr_get_latest_news',
      serverName: 'afr',
      content: RSS_FEED,
    });

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      toolName: 'afr_get_latest_news',
      serverName: 'afr',
      title: 'RBA holds cash rate steady',
      link: 'https://www.afr.com/rba-holds-rate',
    });
    expect(sources[0].content).toContain('RBA holds cash rate steady');
    expect(sources[0].content).toContain('stable');
    expect(sources[0].content).not.toContain('<b>');
    expect(sources[1]).toMatchObject({
      title: 'Iron ore prices jump',
      link: 'https://www.afr.com/iron-ore-jump',
    });
  });

  it('splits an Atom feed into one source per entry, preferring the alternate link', () => {
    const sources = buildMCPResultSources({
      toolName: 'get_feed',
      serverName: 'example',
      content: ATOM_FEED,
    });

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      title: 'First entry',
      link: 'https://example.com/first',
    });
    expect(sources[1]).toMatchObject({
      title: 'Second entry',
      link: 'https://example.com/second',
    });
  });

  it('falls back to a single source for plain-text content', () => {
    const content = 'The current weather in Sydney is sunny with a high of 24C.';
    const sources = buildMCPResultSources({
      toolName: 'get_weather',
      serverName: 'weather',
      content,
    });

    expect(sources).toEqual([{ toolName: 'get_weather', serverName: 'weather', content }]);
  });

  it('falls back to a single source for malformed XML that merely looks like a feed', () => {
    const content = '<rss><channel><item><title>Unterminated';
    const sources = buildMCPResultSources({
      toolName: 'broken_feed',
      serverName: 'broken',
      content,
    });

    expect(sources).toEqual([{ toolName: 'broken_feed', serverName: 'broken', content }]);
  });

  it('falls back to a single source when the feed has no usable items', () => {
    const content = '<rss version="2.0"><channel><title>Empty</title></channel></rss>';
    const sources = buildMCPResultSources({ toolName: 'empty_feed', serverName: 'empty', content });

    expect(sources).toEqual([{ toolName: 'empty_feed', serverName: 'empty', content }]);
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
    const sources = buildMCPResultSources({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      content,
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      toolName: 'ibisworld_report_sections',
      serverName: 'cleartrack-mcp-gateway',
      title: 'Executive Summary Analysis',
    });
    expect(sources[0].content).toContain('Gold prices have risen sharply.');
  });
});
