import {
  urlHash,
  extractLinks,
  extractPromptUrls,
  normaliseReference,
  extractDocumentReferences,
} from '../../src/server/references';

describe('extractPromptUrls', () => {
  it('finds urls and trims trailing punctuation', () => {
    expect(
      extractPromptUrls(
        'See https://a.example/x?y=1, and (https://b.example/z). Also http://c.example!',
      ),
    ).toEqual(['https://a.example/x?y=1', 'https://b.example/z', 'http://c.example']);
  });
});

describe('extractDocumentReferences', () => {
  it('takes every url and explicit onedrive or sharepoint path the user wrote', () => {
    const prompt = `Compare these:
https://contoso.sharepoint.com/sites/x/Shared%20Documents/spec.docx
onedrive:/Documents/notes.docx and sharepoint:/sites/y/plan.docx.`;
    expect(extractDocumentReferences(prompt)).toEqual([
      'https://contoso.sharepoint.com/sites/x/Shared%20Documents/spec.docx',
      'onedrive:/Documents/notes.docx',
      'sharepoint:/sites/y/plan.docx',
    ]);
  });

  it('normalises references so a trailing slash or whitespace does not matter', () => {
    expect(normaliseReference('  https://contoso.sharepoint.com/a/ ')).toBe(
      'https://contoso.sharepoint.com/a',
    );
  });
});

describe('urlHash', () => {
  it('ignores fragments and host case but keeps path and query', () => {
    expect(urlHash('https://Example.com/a?b=1#frag')).toBe(urlHash('https://example.com/a?b=1'));
    expect(urlHash('https://example.com/a?b=2')).not.toBe(urlHash('https://example.com/a?b=1'));
    expect(urlHash('not a url')).toBeUndefined();
  });
});

describe('extractLinks', () => {
  it('resolves http links against the page and skips other schemes', () => {
    const html = `<a href="/next">n</a><a href='https://other.example/p'>o</a>
<a href="javascript:alert(1)">j</a><a href="mailto:x@y">m</a><a href="#top">t</a>`;
    expect(extractLinks(html, 'https://site.example/dir/page')).toEqual([
      'https://site.example/next',
      'https://other.example/p',
      'https://site.example/dir/page',
    ]);
  });

  it('caps the number of links and stays linear on hostile markup', () => {
    const unique = Array.from({ length: 1000 }, (_, i) => `<a href="/x${i}">`).join('');
    const html = `${unique}<a href="/x0">${'href="'.repeat(100_000)}`;
    const started = Date.now();
    expect(extractLinks(html, 'https://s.example/', 50)).toHaveLength(50);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
