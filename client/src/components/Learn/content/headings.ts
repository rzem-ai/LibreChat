export interface ArticleHeading {
  id: string;
  text: string;
  /** Defaults to 2. Level 3 headings nest under the preceding level 2 in the "On this page" list. */
  level?: 2 | 3;
}

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const HEADING_LEVELS: { prefix: string; level: 2 | 3 }[] = [
  { prefix: '### ', level: 3 },
  { prefix: '## ', level: 2 },
];

/** Section (`## `) and sub-section (`### `) headings of an MDX source, skipping anything inside fenced code. */
export function extractHeadings(source: string): ArticleHeading[] {
  let inFence = false;
  return source.split('\n').flatMap((line) => {
    if (line.startsWith('```')) {
      inFence = !inFence;
      return [];
    }
    if (inFence) {
      return [];
    }
    const level = HEADING_LEVELS.find(({ prefix }) => line.startsWith(prefix));
    if (!level) {
      return [];
    }
    const text = line.slice(level.prefix.length).trim();
    return [{ id: slugify(text), text, level: level.level }];
  });
}
