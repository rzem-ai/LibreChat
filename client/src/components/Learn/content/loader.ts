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

const articleModules = import.meta.glob<MdxModule>('./articles/*.mdx');
const articleSources = import.meta.glob<string>('./articles/*.mdx', {
  query: '?raw',
  import: 'default',
});
const releaseModules = import.meta.glob<MdxModule>('./releases/*.mdx');

/** Loads one article (compiled body plus raw source for its headings) on demand. */
/** Resolves `null` for an unknown slug; load or validation failures reject. */
export async function loadArticle(slug: string): Promise<ArticleEntry | null> {
  const path = `./articles/${slug}.mdx`;
  const loadModule = articleModules[path];
  const loadSource = articleSources[path];
  if (!loadModule || !loadSource) {
    return null;
  }
  const [mod, source] = await Promise.all([loadModule(), loadSource()]);
  return {
    id: slug,
    frontmatter: ArticleFrontmatterSchema.parse(mod.frontmatter),
    Content: mod.default,
    headings: extractHeadings(source),
  };
}

/** Loads every release on demand, newest first. */
export async function loadReleases(): Promise<MdxEntry<ReleaseFrontmatter>[]> {
  const releases = await Promise.all(
    Object.entries(releaseModules).map(async ([path, load]) => {
      const mod = await load();
      return {
        id: idFromPath(path),
        frontmatter: ReleaseFrontmatterSchema.parse(mod.frontmatter),
        Content: mod.default,
      };
    }),
  );
  return releases.sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));
}
