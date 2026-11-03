import { parseOpml, buildOpml } from '../../src/server/opml';

const OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My feeds</title></head>
  <body>
    <outline text="Technology">
      <outline type="rss" text="Widget News" title="Widget News" xmlUrl="https://news.example/rss" htmlUrl="https://news.example/"/>
      <outline type="rss" text="Gadgets &amp; Co" xmlUrl="https://gadgets.example/feed"/>
    </outline>
    <outline type="rss" text="Top level" xmlUrl="https://top.example/atom.xml"/>
    <outline type="rss" text="Bad scheme" xmlUrl="javascript:alert(1)"/>
    <outline type="rss" text="Duplicate" xmlUrl="https://news.example/rss"/>
  </body>
</opml>`;

describe('parseOpml', () => {
  it('collects http feeds with titles and categories, skipping invalid and duplicate urls', () => {
    expect(parseOpml(OPML)).toEqual([
      { url: 'https://news.example/rss', title: 'Widget News', folder: ['Technology'] },
      { url: 'https://gadgets.example/feed', title: 'Gadgets & Co', folder: ['Technology'] },
      { url: 'https://top.example/atom.xml', title: 'Top level' },
    ]);
  });

  it('keeps the full folder path of nested outlines', () => {
    const nested = `<opml version="2.0"><body>
      <outline text="AI">
        <outline text="Agents">
          <outline type="rss" text="Deep" xmlUrl="https://deep.example/rss"/>
        </outline>
        <outline type="rss" text="Shallow" xmlUrl="https://shallow.example/rss"/>
      </outline>
    </body></opml>`;
    expect(parseOpml(nested)).toEqual([
      { url: 'https://deep.example/rss', title: 'Deep', folder: ['AI', 'Agents'] },
      { url: 'https://shallow.example/rss', title: 'Shallow', folder: ['AI'] },
    ]);
  });

  it('reads the folders of the AI, cyber and IAM feed list', () => {
    const fs = jest.requireActual<typeof import('node:fs')>('node:fs');
    const path = jest.requireActual<typeof import('node:path')>('node:path');
    const file = path.resolve(__dirname, '../../../../docs/ai-cyber-iam-feeds.opml');
    if (!fs.existsSync(file)) {
      return;
    }
    const feeds = parseOpml(fs.readFileSync(file, 'utf8'));
    expect(feeds).toHaveLength(55);
    expect(new Set(feeds.map((f) => f.folder?.join('/'))).size).toBe(9);
    expect(feeds.every((f) => f.folder?.length === 1)).toBe(true);
  });

  it('rejects a document that is not OPML', () => {
    expect(() => parseOpml('<rss/>')).toThrow('not_opml');
  });
});

describe('buildOpml folders', () => {
  it('writes folder paths as nested outlines that import back unchanged', () => {
    const feeds = [
      { url: 'https://a.example/rss', title: 'A', folder: ['AI', 'Agents'] },
      { url: 'https://b.example/rss', title: 'B', folder: ['AI'] },
      { url: 'https://c.example/rss', title: 'C', folder: ['Cyber & IAM'] },
      { url: 'https://d.example/rss', title: 'D' },
    ];
    expect(parseOpml(buildOpml(feeds, 'Export'))).toEqual(feeds);
  });
});

describe('buildOpml', () => {
  it('round-trips subscriptions with escaping', () => {
    const feeds = [
      { url: 'https://a.example/rss?x=1&y=2', title: 'A & "B" <C>' },
      { url: 'https://b.example/feed' },
    ];
    const xml = buildOpml(feeds, 'Exported feeds');
    expect(xml).toContain('&amp;');
    expect(parseOpml(xml)).toEqual([
      { url: 'https://a.example/rss?x=1&y=2', title: 'A & "B" <C>' },
      { url: 'https://b.example/feed', title: 'https://b.example/feed' },
    ]);
  });
});
