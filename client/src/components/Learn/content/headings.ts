export interface ArticleHeading {
  id: string;
  text: string;
}

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Section headings (`## `) of an MDX source, skipping anything inside fenced code. */
export function extractHeadings(source: string): ArticleHeading[] {
  let inFence = false;
  return source.split('\n').flatMap((line) => {
    if (line.startsWith('```')) {
      inFence = !inFence;
      return [];
    }
    if (inFence || !line.startsWith('## ')) {
      return [];
    }
    const text = line.slice(3).trim();
    return [{ id: slugify(text), text }];
  });
}
