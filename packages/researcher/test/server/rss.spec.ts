import { parseFeed, decodeXmlEntities } from '../../src/server/rss';

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Widget News &amp; Views</title>
    <link>https://news.example/</link>
    <item>
      <title>Prices rise</title>
      <link>https://news.example/prices</link>
      <guid isPermaLink="false">item-1</guid>
      <pubDate>Mon, 02 Nov 2026 09:00:00 GMT</pubDate>
      <description>Short summary</description>
      <content:encoded><![CDATA[<p>Full <b>article</b> text.</p>]]></content:encoded>
    </item>
    <item>
      <title>No guid here</title>
      <link>https://news.example/no-guid</link>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Atom Feed</title>
  <link rel="alternate" href="https://atom.example/"/>
  <link rel="self" href="https://atom.example/feed.xml"/>
  <entry>
    <id>tag:atom.example,2026:1</id>
    <title>Entry one</title>
    <link rel="alternate" href="https://atom.example/1"/>
    <updated>2026-11-01T10:00:00Z</updated>
    <summary>Entry summary</summary>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel><title>RDF Feed</title><link>https://rdf.example/</link></channel>
  <item><title>RDF item</title><link>https://rdf.example/a</link><dc:date>2026-10-30T00:00:00Z</dc:date></item>
</rdf:RDF>`;

describe('parseFeed', () => {
  it('reads RSS 2.0 items, preferring full content over the summary', () => {
    const feed = parseFeed(RSS);
    expect(feed.title).toBe('Widget News & Views');
    expect(feed.siteUrl).toBe('https://news.example/');
    expect(feed.items[0]).toMatchObject({
      guid: 'item-1',
      link: 'https://news.example/prices',
      title: 'Prices rise',
      contentHtml: '<p>Full <b>article</b> text.</p>',
    });
    expect(feed.items[0].publishedAt?.toISOString()).toBe('2026-11-02T09:00:00.000Z');
  });

  it('falls back to the link as the guid', () => {
    expect(parseFeed(RSS).items[1].guid).toBe('https://news.example/no-guid');
  });

  it('reads Atom entries and their alternate links', () => {
    const feed = parseFeed(ATOM);
    expect(feed.title).toBe('Atom Feed');
    expect(feed.siteUrl).toBe('https://atom.example/');
    expect(feed.items[0]).toMatchObject({
      guid: 'tag:atom.example,2026:1',
      link: 'https://atom.example/1',
      title: 'Entry one',
      contentHtml: 'Entry summary',
    });
  });

  it('reads RSS 1.0 (RDF) items', () => {
    const feed = parseFeed(RDF);
    expect(feed.title).toBe('RDF Feed');
    expect(feed.items[0]).toMatchObject({ link: 'https://rdf.example/a', title: 'RDF item' });
    expect(feed.items[0].publishedAt?.toISOString()).toBe('2026-10-30T00:00:00.000Z');
  });

  it('does not expand entities declared in a DOCTYPE', () => {
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE rss [<!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>
<rss version="2.0"><channel><title>&c;</title></channel></rss>`;
    const started = Date.now();
    const feed = parseFeed(bomb);
    expect(Date.now() - started).toBeLessThan(500);
    expect(feed.title ?? '').not.toContain('AAAAAAAAAAAAAAAAAAAA');
  });

  it('rejects documents that are not feeds', () => {
    expect(() => parseFeed('<html><body>Nope</body></html>')).toThrow('not_a_feed');
    expect(() => parseFeed('not xml at all <<<')).toThrow();
  });
});

describe('decodeXmlEntities', () => {
  it('decodes the predefined and numeric entities only', () => {
    expect(
      decodeXmlEntities('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42; &nbsp;'),
    ).toBe('a & b <c> "d" \'e\' AB &nbsp;');
  });
});
