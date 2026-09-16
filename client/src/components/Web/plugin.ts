import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import type { Citation, CitationNode } from './types';
import { SPAN_REGEX, STANDALONE_PATTERN, CLEANUP_REGEX, COMPOSITE_REGEX } from '~/utils/citations';

/**
 * Checks if a standalone marker is truly standalone (not inside a composite block).
 * A marker is inside a composite if there's an opening \ue200 without a closing \ue201 after it.
 *
 * Handles both literal text format ("\ue200") and actual Unicode (U+E200) by checking
 * for both and using the rightmost occurrence. This correctly handles:
 * - Pure literal format: "\ue200...\ue201"
 * - Pure Unicode format: "..."
 * - Mixed formats: "\ue200..." (different formats for open/close)
 */
function isStandaloneMarker(text: string, position: number): boolean {
  const beforeText = text.substring(0, position);

  // Find rightmost composite block start (either format)
  const lastUe200Literal = beforeText.lastIndexOf('\\ue200');
  const lastUe200Char = beforeText.lastIndexOf('\ue200');
  const lastUe200 = Math.max(lastUe200Literal, lastUe200Char);

  // Find rightmost composite block end (either format)
  const lastUe201Literal = beforeText.lastIndexOf('\\ue201');
  const lastUe201Char = beforeText.lastIndexOf('\ue201');
  const lastUe201 = Math.max(lastUe201Literal, lastUe201Char);

  // Standalone if: no opening marker OR closing marker appears after opening
  return lastUe200 === -1 || (lastUe201 !== -1 && lastUe201 > lastUe200);
}

/**
 * Find the next pattern match from the current position
 */
function findNextMatch(
  text: string,
  position: number,
): { type: string; match: RegExpExecArray | null; index: number } | null {
  // Reset regex lastIndex to start from current position
  SPAN_REGEX.lastIndex = position;
  COMPOSITE_REGEX.lastIndex = position;
  STANDALONE_PATTERN.lastIndex = position;

  // Find next occurrence of each pattern
  const spanMatch = SPAN_REGEX.exec(text);
  const compositeMatch = COMPOSITE_REGEX.exec(text);

  // For standalone, we need to check each match
  let standaloneMatch: RegExpExecArray | null = null;
  STANDALONE_PATTERN.lastIndex = position;

  // Find the first standalone match that's not inside a composite block
  let match: RegExpExecArray | null;
  while (!standaloneMatch && (match = STANDALONE_PATTERN.exec(text)) !== null) {
    if (isStandaloneMarker(text, match.index)) {
      standaloneMatch = match;
    }
  }

  // Find closest match
  let nextMatch: RegExpExecArray | null = null;
  let matchType = '';
  let matchIndex = -1;
  let typeIndex = -1;

  if (spanMatch && (!nextMatch || spanMatch.index < matchIndex || matchIndex === -1)) {
    nextMatch = spanMatch;
    matchType = 'span';
    matchIndex = spanMatch.index;
    // We can use a counter for typeIndex if needed
    typeIndex = 0;
  }

  if (compositeMatch && (!nextMatch || compositeMatch.index < matchIndex || matchIndex === -1)) {
    nextMatch = compositeMatch;
    matchType = 'composite';
    matchIndex = compositeMatch.index;
    typeIndex = 0;
  }

  if (standaloneMatch && (!nextMatch || standaloneMatch.index < matchIndex || matchIndex === -1)) {
    nextMatch = standaloneMatch;
    matchType = 'standalone';
    matchIndex = standaloneMatch.index;
    typeIndex = 0;
  }

  if (!nextMatch) return null;

  return { type: matchType, match: nextMatch, index: typeIndex };
}

// Deloitte Custom Change: `typeCounts`/`matchIndex` in `processTree` are only unique within a
// single text node, so the same citationId (e.g. "standalone-0-5") can recur in unrelated blocks.
// `MarkdownBlocks` parses each top-level block through its own `ReactMarkdown`/unified instance
// (see `MarkdownBlocks.tsx`), so a counter scoped inside `processTree` would restart at 0 for
// every block. Keeping it at module scope instead makes every generated id unique across the
// whole message, not just within one block's tree.
let globalNodeSeq = 0;

function processTree(tree: Node) {
  visit(tree, 'text', (node, index, parent) => {
    const textNode = node as CitationNode;
    const parentNode = parent as CitationNode;

    if (typeof textNode.value !== 'string') return;

    const nodeSeq = globalNodeSeq++;
    const originalValue = textNode.value;
    const segments: Array<CitationNode> = [];

    // Single-pass processing through the string
    let currentPosition = 0;

    // Important change: Create a map to track citation IDs by their position
    // This ensures consistent IDs across multiple segments
    const citationIds = new Map<number, string>();
    const typeCounts = { span: 0, composite: 0, standalone: 0 };

    while (currentPosition < originalValue.length) {
      const nextMatchInfo = findNextMatch(originalValue, currentPosition);

      if (!nextMatchInfo) {
        // No more matches, add remaining content with cleanup
        const remainingText = originalValue.substring(currentPosition).replace(CLEANUP_REGEX, '');
        if (remainingText) {
          segments.push({ type: 'text', value: remainingText });
        }
        break;
      }

      const { type, match } = nextMatchInfo;
      const matchIndex = match!.index;
      const matchText = match![0];

      // Add cleaned text before this match
      if (matchIndex > currentPosition) {
        const textBeforeMatch = originalValue
          .substring(currentPosition, matchIndex)
          .replace(CLEANUP_REGEX, '');

        if (textBeforeMatch) {
          segments.push({ type: 'text', value: textBeforeMatch });
        }
      }

      // Generate a unique ID for this citation based on its position in the text
      const citationId = `${nodeSeq}-${type}-${typeCounts[type as keyof typeof typeCounts]}-${matchIndex}`;
      citationIds.set(matchIndex, citationId);

      // Process based on match type
      switch (type) {
        case 'span': {
          const spanText = matchText;
          const cleanText = spanText.replace(/\\ue203|\\ue204/g, '');

          // Look ahead for associated citation
          let associatedCitationId: string | null = null;
          const endOfSpan = matchIndex + matchText.length;

          // Check if there's a citation right after this span
          const nextCitation = findNextMatch(originalValue, endOfSpan);
          if (
            nextCitation &&
            (nextCitation.type === 'standalone' || nextCitation.type === 'composite') &&
            nextCitation.match!.index - endOfSpan < 5
          ) {
            // Use the ID that will be generated for the next citation
            const nextIndex = nextCitation.match!.index;
            const nextType = nextCitation.type;
            associatedCitationId = `${nodeSeq}-${nextType}-${typeCounts[nextType as keyof typeof typeCounts]}-${nextIndex}`;
          }

          segments.push({
            type: 'highlighted-text',
            data: {
              hName: 'highlighted-text',
              hProperties: { citationId: associatedCitationId },
            },
            children: [{ type: 'text', value: cleanText }],
          });

          typeCounts.span++;
          break;
        }

        case 'composite': {
          const compositeText = matchText;

          // Use a regular expression to extract reference indices
          const compositeRefRegex = new RegExp(STANDALONE_PATTERN.source, 'g');
          let refMatch: RegExpExecArray | null;
          const citations: Array<Citation> = [];

          while ((refMatch = compositeRefRegex.exec(compositeText)) !== null) {
            const turn = Number(refMatch[1]);
            const refType = refMatch[2];
            const refIndex = Number(refMatch[3]);

            citations.push({
              turn,
              refType,
              index: refIndex,
            });
          }

          if (citations.length > 0) {
            segments.push({
              type: 'composite-citation',
              data: {
                hName: 'composite-citation',
                hProperties: {
                  citations,
                  citationId: citationId,
                },
              },
            });
          }

          typeCounts.composite++;
          break;
        }

        case 'standalone': {
          // Extract reference info
          const turn = Number(match![1]);
          const refType = match![2];
          const refIndex = Number(match![3]);

          segments.push({
            type: 'citation',
            data: {
              hName: 'citation',
              hProperties: {
                citation: {
                  turn,
                  refType,
                  index: refIndex,
                },
                citationType: 'standalone',
                citationId: citationId,
              },
            },
          });

          typeCounts.standalone++;
          break;
        }
      }

      // Move position forward
      currentPosition = matchIndex + matchText.length;
    }

    // Replace the original node with our segments or clean up the original
    if (segments.length > 0 && index !== undefined) {
      parentNode.children?.splice(index, 1, ...segments);
      return index + segments.length;
    } else if (textNode.value !== textNode.value.replace(CLEANUP_REGEX, '')) {
      // If we didn't create segments but there are markers to clean up
      textNode.value = textNode.value.replace(CLEANUP_REGEX, '');
    }
  });
}

/**
 * Deloitte Custom Change
 * mdast node types that are phrasing (inline) content, per the CommonMark/mdast
 * spec, plus this plugin's own inline node types (`citation`, `composite-citation`,
 * `highlighted-text`). Anything not in this set is treated as flow (block) content.
 * Kept as a local list rather than depending on `mdast-util-phrasing` (only a
 * transitive dependency here, and it wouldn't know about our custom node types anyway).
 */
const PHRASING_TYPES = new Set([
  'text',
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'break',
  'link',
  'linkReference',
  'image',
  'imageReference',
  'footnoteReference',
  'html',
  'citation',
  'composite-citation',
  'highlighted-text',
]);

function isPhrasing(node: CitationNode): boolean {
  return typeof node.type === 'string' && PHRASING_TYPES.has(node.type);
}

/**
 * Deloitte Custom Change: extracts a node's citation refs regardless of whether it's a
 * standalone `citation` or an already-grouped `composite-citation`, stamping each ref with
 * the citationId of the node it came from (falling back to the group's own id for refs that
 * were authored together in one composite marker and never had an individual id). Preserving
 * the per-ref id — instead of collapsing every ref in a merge to one survivor id — means each
 * rendered chip highlights only the text span that actually produced it.
 */
function toCitations(node: CitationNode): Array<Citation> {
  const nodeCitationId = node.data?.hProperties?.citationId ?? null;
  if (node.type === 'citation') {
    const citation = node.data?.hProperties?.citation;
    return citation ? [{ ...citation, citationId: nodeCitationId }] : [];
  }
  if (node.type === 'composite-citation') {
    const citations = node.data?.hProperties?.citations ?? [];
    return citations.map((citation) => ({ citationId: nodeCitationId, ...citation }));
  }
  return [];
}

/**
 * Deloitte Custom Change
 * Merges multiple citation chips relocated to the same block ancestor into a single
 * `composite-citation` node — e.g. several report-section citations that turn out to share
 * the same underlying link render as one chip instead of one per section. Each ref keeps the
 * citationId of its originating node (see {@link toCitations}), so no cross-block id
 * remapping is needed afterwards.
 */
function mergeCitationNodes(nodes: Array<CitationNode>): CitationNode {
  const mergedId = nodes[0].data?.hProperties?.citationId ?? null;
  return {
    type: 'composite-citation',
    data: {
      hName: 'composite-citation',
      hProperties: { citations: nodes.flatMap(toCitations), citationId: mergedId },
    },
  };
}

/**
 * Deloitte Custom Change
 * Recursively moves every `citation`/`composite-citation` node (mutating the
 * tree in place) to the end of its nearest non-phrasing (block) ancestor —
 * e.g. a paragraph, heading, or table cell — so chips never interrupt the
 * middle of a sentence, regardless of how deeply nested inside inline nodes
 * (emphasis/strong/links/etc.) they originally appeared. When more than one
 * chip lands at the same block, they're merged into a single
 * `composite-citation` (see {@link mergeCitationNodes}) instead of staying as
 * separate siblings. `highlighted-text` nodes are left untouched since they
 * represent real inline content, not a relocatable chip. Returns any
 * citations still bubbling up through phrasing ancestors (empty once
 * absorbed by a block ancestor).
 */
function relocateCitations(node: CitationNode): Array<CitationNode> {
  if (!node.children || node.children.length === 0) return [];

  const bubbled: Array<CitationNode> = [];
  const keptChildren: Array<CitationNode> = [];

  for (const child of node.children) {
    if (child.type === 'citation' || child.type === 'composite-citation') {
      bubbled.push(child);
      continue;
    }
    if (child.type === 'highlighted-text') {
      keptChildren.push(child);
      continue;
    }
    const hadChildren = Array.isArray(child.children) && child.children.length > 0;
    const childBubbled = relocateCitations(child);
    if (isPhrasing(child)) {
      bubbled.push(...childBubbled);
    }
    if (hadChildren && Array.isArray(child.children) && child.children.length === 0) {
      continue;
    }
    keptChildren.push(child);
  }

  if (isPhrasing(node)) {
    node.children = keptChildren;
    return bubbled;
  }

  const mergedBubbled = bubbled.length > 1 ? [mergeCitationNodes(bubbled)] : bubbled;
  node.children = [...keptChildren, ...mergedBubbled];
  return [];
}

export function unicodeCitation() {
  return (tree: Node) => {
    processTree(tree);
    relocateCitations(tree as CitationNode);
  };
}
