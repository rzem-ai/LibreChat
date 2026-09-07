import type { CitationNode } from '~/components/Web/types';
import { unicodeCitation } from '~/components/Web/plugin';

// Marker builders below use the literal escape-sequence format LLMs are instructed to emit
// (see utils/citations.ts for the full format reference).

/** Builds a single standalone citation marker for the given ref type/index (turn is always 0). */
const STANDALONE = (refType: string, index: number) => `\\ue202turn0${refType}${index}`;

/** Wraps one or more standalone markers in a composite-citation group marker. */
const COMPOSITE = (...refs: Array<[refType: string, index: number]>) =>
  `\\ue200${refs.map(([refType, index]) => STANDALONE(refType, index)).join('')}\\ue201`;

/** Wraps `content` in highlight-span markers. */
const SPAN = (content: string) => `\\ue203${content}\\ue204`;

/** Builds a plain mdast text node. */
function text(value: string): CitationNode {
  return { type: 'text', value };
}

/** Builds an mdast node of the given `type` wrapping `children` (e.g. paragraph, strong, link). */
function inline(type: string, children: Array<CitationNode>): CitationNode {
  return { type, children };
}

/** Builds an mdast paragraph node wrapping `children`. */
function paragraph(children: Array<CitationNode>): CitationNode {
  return inline('paragraph', children);
}

/** Runs the real plugin pipeline (marker parsing + relocation) on a hand-built mdast tree. */
function run(tree: CitationNode): CitationNode {
  unicodeCitation()(tree as never);
  return tree;
}

/** Compact, order-preserving description of a node's direct children. */
function summarize(node: CitationNode): Array<string> {
  return (node.children ?? []).map((child) => {
    switch (child.type) {
      case 'text':
        return `text:${child.value}`;
      case 'citation': {
        const citation = child.data?.hProperties?.citation;
        return `citation:${citation?.refType}${citation?.index}`;
      }
      case 'composite-citation': {
        const citations = child.data?.hProperties?.citations ?? [];
        return `composite:${citations.map((c) => `${c.refType}${c.index}`).join(',')}`;
      }
      case 'highlighted-text':
        return `highlighted:${child.children?.[0]?.value}`;
      default:
        return `${child.type}`;
    }
  });
}

describe('unicodeCitation - relocateCitations', () => {
  it('leaves plain paragraphs with no citations untouched', () => {
    const tree = run(paragraph([text('Just plain text with no markers.')]));

    expect(summarize(tree)).toEqual(['text:Just plain text with no markers.']);
  });

  it('moves a citation appearing mid-sentence to the end of the paragraph', () => {
    const tree = run(
      paragraph([
        text(
          `This is a sentence with a citation${STANDALONE('search', 0)} right in the middle, and it keeps going.`,
        ),
      ]),
    );

    expect(summarize(tree)).toEqual([
      'text:This is a sentence with a citation',
      'text: right in the middle, and it keeps going.',
      'citation:search0',
    ]);
  });

  it('is a no-op when the citation is already at the end of the paragraph', () => {
    const tree = run(paragraph([text(`Sentence ends here${STANDALONE('search', 0)}`)]));

    expect(summarize(tree)).toEqual(['text:Sentence ends here', 'citation:search0']);
  });

  it('preserves left-to-right order when relocating multiple citations in one paragraph', () => {
    const tree = run(
      paragraph([
        text(
          `A${STANDALONE('search', 0)} B${STANDALONE('search', 1)} C${STANDALONE('search', 2)} end.`,
        ),
      ]),
    );

    expect(summarize(tree)).toEqual([
      'text:A',
      'text: B',
      'text: C',
      'text: end.',
      'citation:search0',
      'citation:search1',
      'citation:search2',
    ]);
  });

  it('relocates a composite citation that appears mid-sentence', () => {
    const tree = run(
      paragraph([
        text(`Multiple sources agree${COMPOSITE(['search', 0], ['news', 1])} on this fact.`),
      ]),
    );

    expect(summarize(tree)).toEqual([
      'text:Multiple sources agree',
      'text: on this fact.',
      'composite:search0,news1',
    ]);
  });

  it('moves a citation out of nested inline nodes (e.g. bold text) to the paragraph end', () => {
    const tree = run(
      paragraph([
        text('This is '),
        inline('strong', [text(`bold text${STANDALONE('search', 0)} continues`)]),
        text(' normal text.'),
      ]),
    );

    const strongNode = tree.children?.find((child) => child.type === 'strong');

    expect(summarize(tree).at(-1)).toBe('citation:search0');
    // the citation must be lifted out of the nested `strong` node entirely
    expect(strongNode?.children?.some((child) => child.type === 'citation')).toBe(false);
  });

  it('moves a citation out of a doubly-nested inline node (link inside emphasis)', () => {
    const tree = run(
      paragraph([
        inline('emphasis', [
          text('see '),
          inline('link', [text(`this source${STANDALONE('search', 0)}`)]),
        ]),
        text(' for more.'),
      ]),
    );

    expect(summarize(tree).at(-1)).toBe('citation:search0');
    const emphasisNode = tree.children?.find((child) => child.type === 'emphasis');
    const linkNode = emphasisNode?.children?.find((child) => child.type === 'link');
    expect(linkNode?.children?.some((child) => child.type === 'citation')).toBe(false);
  });

  it('keeps highlighted-text spans in place while relocating only the citation chip', () => {
    const tree = run(
      paragraph([
        text(`Before ${SPAN('highlighted quote')}${STANDALONE('search', 0)} after text.`),
      ]),
    );

    expect(summarize(tree)).toEqual([
      'text:Before ',
      'highlighted:highlighted quote',
      'text: after text.',
      'citation:search0',
    ]);
  });

  it('does not recurse into highlighted-text nodes, even if one were to contain a citation', () => {
    // highlighted-text is documented as opaque, real inline content -- extractCitations must
    // treat it as a leaf and never pull a citation out from underneath it.
    const highlighted = inline('highlighted-text', [
      text('quoted text'),
      {
        type: 'citation',
        data: {
          hName: 'citation',
          hProperties: {
            citation: { turn: 0, refType: 'search', index: 0 },
            citationType: 'standalone',
            citationId: 'standalone-0-0',
          },
        },
      },
    ]);

    const tree = run(paragraph([text('Before '), highlighted, text(' after.')]));

    // the citation must remain nested inside highlighted-text, not lifted to the paragraph end
    expect(summarize(tree).some((entry) => entry.startsWith('citation:'))).toBe(false);
    expect(highlighted.children?.some((child) => child.type === 'citation')).toBe(true);
  });

  it('scopes relocation to each paragraph independently in multi-paragraph documents', () => {
    const root: CitationNode = {
      type: 'root',
      children: [
        paragraph([
          text(`First paragraph with a citation${STANDALONE('search', 0)} in the middle.`),
        ]),
        paragraph([
          text(
            `Second paragraph with a different citation${STANDALONE('search', 1)} in the middle.`,
          ),
        ]),
      ],
    };

    const tree = run(root);
    const [firstParagraph, secondParagraph] = tree.children ?? [];

    expect(summarize(firstParagraph).at(-1)).toBe('citation:search0');
    expect(summarize(secondParagraph).at(-1)).toBe('citation:search1');
    // citations must not leak into the other paragraph
    expect(summarize(firstParagraph)).not.toContain('citation:search1');
    expect(summarize(secondParagraph)).not.toContain('citation:search0');
  });

  it('relocates citations within each list item (dot point) paragraph independently', () => {
    const root: CitationNode = {
      type: 'root',
      children: [
        {
          type: 'list',
          children: [
            {
              type: 'listItem',
              children: [
                paragraph([text(`First point${STANDALONE('search', 0)} has more text after it.`)]),
              ],
            },
            {
              type: 'listItem',
              children: [
                paragraph([
                  text(`Second point with ${STANDALONE('search', 1)} citation in the middle.`),
                ]),
              ],
            },
            {
              type: 'listItem',
              children: [paragraph([text('Third point with no citation.')])],
            },
          ],
        },
      ],
    };

    const tree = run(root);
    const listItems = tree.children?.[0]?.children ?? [];
    const [first, second, third] = listItems.map((item) => item.children?.[0] as CitationNode);

    expect(summarize(first)).toEqual([
      'text:First point',
      'text: has more text after it.',
      'citation:search0',
    ]);
    expect(summarize(second)).toEqual([
      'text:Second point with ',
      'text: citation in the middle.',
      'citation:search1',
    ]);
    expect(summarize(third)).toEqual(['text:Third point with no citation.']);
  });
});
