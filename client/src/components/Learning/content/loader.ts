import type { ComponentType } from 'react';
import type { MDXProps } from 'mdx/types';
import type { ArticleFrontmatter, ReleaseFrontmatter } from './schema';
import type { ArticleHeading } from './headings';
import { ArticleFrontmatterSchema, ReleaseFrontmatterSchema } from './schema';
import { extractHeadings } from './headings';

interface MdxModule {
  default: ComponentType<MDXProps>;
  frontmatter: unknown;
}

interface MdxEntry<T> {
  id: string;
  frontmatter: T;
  Content: ComponentType<MDXProps>;
}

export interface ArticleEntry extends MdxEntry<ArticleFrontmatter> {
  headings: ArticleHeading[];
}

const idFromPath = (path: string): string =>
  path
    .split('/')
    .pop()
    ?.replace(/\.mdx$/, '') ?? path;

function parseModules<T>(
  modules: Record<string, MdxModule>,
  parse: (frontmatter: unknown) => T,
): MdxEntry<T>[] {
  return Object.entries(modules).map(([path, mod]) => ({
    id: idFromPath(path),
    frontmatter: parse(mod.frontmatter),
    Content: mod.default,
  }));
}

const articleSources = new Map(
  Object.entries(
    import.meta.glob<string>('./articles/*.mdx', { eager: true, query: '?raw', import: 'default' }),
  ).map(([path, source]) => [idFromPath(path), source]),
);

const articles: ArticleEntry[] = parseModules<ArticleFrontmatter>(
  import.meta.glob<MdxModule>('./articles/*.mdx', { eager: true }),
  (frontmatter) => ArticleFrontmatterSchema.parse(frontmatter),
).map((article) => ({
  ...article,
  headings: extractHeadings(articleSources.get(article.id) ?? ''),
}));

/** Newest first. */
export const RELEASES: MdxEntry<ReleaseFrontmatter>[] = parseModules<ReleaseFrontmatter>(
  import.meta.glob<MdxModule>('./releases/*.mdx', { eager: true }),
  (frontmatter) => ReleaseFrontmatterSchema.parse(frontmatter),
).sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));

export function getArticle(slug: string): ArticleEntry | undefined {
  return articles.find((article) => article.id === slug);
}
