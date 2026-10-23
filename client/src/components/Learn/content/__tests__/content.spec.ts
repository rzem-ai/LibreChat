import fs from 'fs';
import path from 'path';
import { TOURS } from '../registry';
import { RESOURCES } from '../data';

const contentDir = path.resolve(__dirname, '..');
const mdxFiles = (dir: string): string[] =>
  (fs.readdirSync(path.join(contentDir, dir), { recursive: true }) as string[])
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => file.split(path.sep).join('/'));

describe('learning content', () => {
  it('has exactly one Getting Started tour with unique ids', () => {
    expect(TOURS.filter((tour) => tour.isGettingStartedTour)).toHaveLength(1);
    expect(new Set(TOURS.map((tour) => tour.id)).size).toBe(TOURS.length);
  });

  it('gives every article resource an id that matches an MDX file, including nested ones', () => {
    const slugs = mdxFiles('articles').map((file) => file.replace(/\.mdx$/, ''));
    RESOURCES.filter((resource) => resource.type === 'article').forEach((resource) =>
      expect(slugs).toContain(resource.id),
    );
  });

  it('points every tour resource at a known tour and every external resource at a url', () => {
    const tourIds = TOURS.map((tour) => tour.id);
    RESOURCES.filter((resource) => resource.type === 'tour').forEach((resource) =>
      expect(tourIds).toContain(resource.id),
    );
    RESOURCES.filter((resource) => resource.type === 'external').forEach((resource) =>
      expect(resource.externalHref).toBeDefined(),
    );
  });

  it.each(['articles', 'releases'])('starts every %s MDX file with frontmatter', (dir) => {
    mdxFiles(dir).forEach((file) =>
      expect(fs.readFileSync(path.join(contentDir, dir, file), 'utf8').startsWith('---\n')).toBe(
        true,
      ),
    );
  });
});
