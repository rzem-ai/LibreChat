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
      { id: 'getting-started', text: 'Getting started', level: 2 },
      { id: 'next-steps', text: 'Next: steps', level: 2 },
    ]);
  });

  it('returns sub-section headings with their level, in document order', () => {
    const source = ['## Create a skill', '### Plan first', '### Test and refine', '## Share'].join(
      '\n',
    );

    expect(extractHeadings(source)).toEqual([
      { id: 'create-a-skill', text: 'Create a skill', level: 2 },
      { id: 'plan-first', text: 'Plan first', level: 3 },
      { id: 'test-and-refine', text: 'Test and refine', level: 3 },
      { id: 'share', text: 'Share', level: 2 },
    ]);
  });

  it('ignores deeper headings', () => {
    expect(extractHeadings('#### Too deep')).toEqual([]);
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
