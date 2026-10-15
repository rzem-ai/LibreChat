import { extractHeadings, slugify } from '../headings';

describe('extractHeadings', () => {
  it('returns each section heading with its slug id', () => {
    const source = [
      '---',
      'title: Demo',
      '---',
      '# Title',
      '## Getting started',
      'Body',
      '## Next: steps',
    ].join('\n');

    expect(extractHeadings(source)).toEqual([
      { id: 'getting-started', text: 'Getting started' },
      { id: 'next-steps', text: 'Next: steps' },
    ]);
  });

  it('ignores lines that look like headings inside fenced code', () => {
    const source = ['## Real', '```md', '## Not a heading', '```', '## Also real'].join('\n');

    expect(extractHeadings(source).map((heading) => heading.text)).toEqual(['Real', 'Also real']);
  });

  it('returns an empty list when there are no section headings', () => {
    expect(extractHeadings('Just prose.')).toEqual([]);
  });
});

describe('slugify', () => {
  it('lowercases and collapses punctuation and spacing into single dashes', () => {
    expect(slugify('  Hello,  World! ')).toBe('hello-world');
  });
});
