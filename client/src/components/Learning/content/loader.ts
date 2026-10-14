import type { ComponentType } from 'react';
import type { MDXProps } from 'mdx/types';
import type { ArticleFrontmatter, ReleaseFrontmatter } from './schema';
import { ArticleFrontmatterSchema, ReleaseFrontmatterSchema } from './schema';

interface MdxModule {
  default: ComponentType<MDXProps>;
  frontmatter: unknown;
}

interface MdxEntry<T> {
  id: string;
  frontmatter: T;
  Content: ComponentType<MDXProps>;
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

const articles = parseModules<ArticleFrontmatter>(
  import.meta.glob<MdxModule>('./articles/*.mdx', { eager: true }),
  (frontmatter) => ArticleFrontmatterSchema.parse(frontmatter),
);

/** Newest first. */
export const RELEASES: MdxEntry<ReleaseFrontmatter>[] = parseModules<ReleaseFrontmatter>(
  import.meta.glob<MdxModule>('./releases/*.mdx', { eager: true }),
  (frontmatter) => ReleaseFrontmatterSchema.parse(frontmatter),
).sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));

export function getArticle(slug: string): MdxEntry<ArticleFrontmatter> | undefined {
  return articles.find((article) => article.id === slug);
}
