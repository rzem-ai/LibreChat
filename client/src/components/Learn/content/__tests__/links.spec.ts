import fs from 'fs';
import path from 'path';
import { extractHeadings, slugify } from '../headings';
import faqs from '../faqs.json';

const articlesDir = path.resolve(__dirname, '../articles');
const ARTICLE_LINK = /\/learn\/articles\/([a-z0-9/-]+?)(?:#([a-z0-9-]+))?(?=[\s)"'`<>\]]|$)/g;
const TERM_NAME = /<Term\s+name="([^"]+)"/g;

const slugsOf = (): string[] =>
  (fs.readdirSync(articlesDir, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.mdx'))
    .map((file) =>
      file
        .split(path.sep)
        .join('/')
        .replace(/\.mdx$/, ''),
    );

const readArticle = (slug: string): string =>
  fs.readFileSync(path.join(articlesDir, `${slug}.mdx`), 'utf8');

const anchorsOf = (slug: string): string[] => {
  const source = readArticle(slug);
  const terms = [...source.matchAll(TERM_NAME)].map((match) => slugify(match[1]));
  return [...extractHeadings(source).map((heading) => heading.id), ...terms];
};

interface ArticleLink {
  from: string;
  slug: string;
  anchor?: string;
}

const linksIn = (from: string, text: string): ArticleLink[] =>
  [...text.matchAll(ARTICLE_LINK)].map((match) => ({ from, slug: match[1], anchor: match[2] }));

describe('article links', () => {
  const slugs = slugsOf();
  const links = [
    ...slugs.flatMap((slug) => linksIn(slug, readArticle(slug))),
    ...faqs.flatMap((faq) => linksIn(`faq: ${faq.question}`, faq.answer)),
  ];

  it.each(slugs)('gives every heading in %s a unique anchor', (slug) => {
    const anchors = anchorsOf(slug);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it.each(links.map((link) => [link.from, link.slug, link.anchor ?? ''] as const))(
    'resolves the link in %s to %s#%s',
    (_from, slug, anchor) => {
      expect(slugs).toContain(slug);
      if (anchor) {
        expect(anchorsOf(slug)).toContain(anchor);
      }
    },
  );
});
