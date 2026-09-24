/**
 * End-of-trace citations.
 *
 * After an agent run finishes, this module deterministically inserts citation
 * anchors into the assistant's answer by matching each answer sentence against
 * the passages the `file_search`, `web_search` (organic/news only), and MCP
 * tools retrieved. It replaces the previous approach of instructing the model
 * to echo anchor markers itself, which was unreliable and risked degrading
 * answer quality.
 *
 * Matching is lexical: a sentence is anchored to a passage when enough of its
 * content words also appear in that passage. Two profiles exist because
 * sources differ in how closely the model paraphrases them: file_search
 * chunks are long and often quoted closely, so they use the strict, unstemmed
 * `SIMILARITY_THRESHOLD`; MCP and web_search (organic/news) sources are short,
 * loosely-paraphrased article excerpts, so they use the looser
 * `MCP_SIMILARITY_THRESHOLD` with `tokenizeStemmed` — a strict/unstemmed
 * profile on these sources tends to only match a sentence that echoes a
 * source's title near-verbatim (e.g. a heading) while starving every
 * paraphrased body claim of a citation. Each anchor encodes the coordinates
 * the frontend resolves — `turn{N}file{M}` for file_search (N is the
 * attachment index, M the first-seen fileId index within it),
 * `turn{N}search{M}`/`turn{N}news{M}` for web_search (N is the attachment's
 * own `turn` value, M the organic/topStories index), and `turn{N}mcp{M}` for
 * MCP results (mirrors `useSearchResultsByTurn` on the client in every case).
 */
import { Tools, ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  TAttachment,
  MCPResultSource,
  SearchResultData,
} from 'librechat-data-provider';
import type { Logger } from 'winston';

/**
 * Minimum content words a sentence must have before it is eligible for a
 * citation anchor. Guards against spurious matches on short fragments.
 */
const MIN_SENTENCE_CONTENT_WORDS = 4;
/** Fraction of a sentence's content tokens that must appear in a passage. */
const SIMILARITY_THRESHOLD = 0.6;
/**
 * Lower similarity bar used for MCP citations. File_search sentences tend to
 * closely paraphrase a retrieved chunk; MCP answers summarize a news article
 * much more freely (different wording, added context), so the same 0.6 bar
 * used for file citations misses most true matches.
 */
const MCP_SIMILARITY_THRESHOLD = 0.35;
/**
 * Upper bound on citation anchors appended to a single sentence. When more than
 * three distinct sources clear the `SIMILARITY_THRESHOLD`, the highest-similarity
 * ones are kept (see the score-sort in `anchorsForSentence`). Top 3 are the distinct sources
 * whose best passage (highest scoring of that source) most strongly overlaps the sentence.
 */
const MAX_ANCHORS_PER_SENTENCE = 3;
/** Citation marker character (U+E202) the frontend parses; see client citations.ts. */
const ANCHOR_MARKER = '\ue202';
/** Default KX usage-guidelines link, used when `KX_USAGE_GUIDELINES_URL` isn't configured. */
const DEFAULT_KX_USAGE_GUIDELINES_URL =
  'https://resources.deloitte.com/sites/kx/SitePages/Prompt-Usage-Guidelines.aspx';

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'by',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'they',
  'we',
  'them',
  'his',
  'her',
  'their',
  'our',
  'your',
  'my',
  'me',
  'us',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'may',
  'might',
  'must',
  'not',
  'no',
  'so',
  'than',
  'then',
  'there',
  'here',
  'what',
  'which',
  'who',
  'when',
  'where',
  'why',
  'how',
  'all',
  'any',
  'each',
  'about',
  'into',
  'over',
  'up',
  'out',
  'off',
]);

/** Runtime shape of a file_search attachment source (see fileSearch.js). */
interface FileSearchSource {
  /** Unique identifier of the source file as stored in the vector store. */
  fileId: string;
  /** Human-readable display name of the file (used in the citation label). */
  fileName?: string;
  /** Raw text excerpt retrieved from the file by the file_search tool. */
  content?: string;
  /**
   * Cosine-similarity score (0–1) between the query and this passage,
   * as returned by the vector store. Higher values indicate a closer match.
   */
  relevance?: number;
}

/**
 * A retrieved passage mapped to the anchor coordinates the frontend resolves.
 * Each passage corresponds to one source entry from a single file_search call.
 */
interface Passage {
  /**
   * Zero-based index into the ordered list of file_search attachments on the
   * message — the `N` in the `turn{N}file{M}` anchor resolved by the client.
   */
  turn: number;
  /**
   * First-seen deduplication index of the source's `fileId` within its
   * file_search attachment — the `M` in the `turn{N}file{M}` anchor.
   * Mirrors the index built by `useSearchResultsByTurn` on the client.
   */
  fileIndex: number;
  /** Normalised content-word tokens of the passage, used for similarity matching. */
  tokens: Set<string>;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

/**
 * Reduces a content word to a crude root form so different inflections of the
 * same fact overlap (e.g. `succeeding`/`succeeds`, `reported`/`reports`,
 * `named`/`names`). MCP answers frequently restate a source passage using a
 * different verb tense or plurality, and exact-string matching alone treats
 * those as unrelated tokens. Applied only to MCP matching — file_search
 * passages tend to closely paraphrase, so stemming there would loosen an
 * already-tuned threshold rather than help it.
 */
function stem(token: string): string {
  if (token.length > 6 && token.endsWith('ing')) {
    return token.slice(0, -3);
  }
  if (token.length > 5 && token.endsWith('ies')) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 5 && token.endsWith('ed')) {
    return token.slice(0, -2);
  }
  if (token.length > 4 && token.endsWith('es')) {
    return token.slice(0, -2);
  }
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenizeStemmed(text: string): string[] {
  return tokenize(text).map(stem);
}

function extractSources(attachment: TAttachment): FileSearchSource[] | undefined {
  const payload = attachment[Tools.file_search] as { sources?: FileSearchSource[] } | undefined;
  if (!payload || !Array.isArray(payload.sources)) {
    return undefined;
  }
  return payload.sources;
}

/**
 * Builds the passage list keyed by the coordinates the frontend uses to resolve
 * `turn{N}file{M}` anchors: N is the file_search attachment index, M is the
 * source's fileId index after first-seen deduplication (see useSearchResultsByTurn).
 */
function buildPassages(fileSearchAttachments: TAttachment[]): Passage[] {
  const passages: Passage[] = [];

  let turn = 0;
  for (const attachment of fileSearchAttachments) {
    const sources = extractSources(attachment);
    if (!sources) {
      continue;
    }

    const fileIndexById = new Map<string, number>();
    for (const source of sources) {
      if (!fileIndexById.has(source.fileId)) {
        fileIndexById.set(source.fileId, fileIndexById.size);
      }
    }

    for (const source of sources) {
      const tokens = new Set(tokenize(source.content ?? ''));
      if (tokens.size === 0) {
        continue;
      }
      passages.push({ turn, fileIndex: fileIndexById.get(source.fileId) ?? 0, tokens });
    }

    turn += 1;
  }

  return passages;
}

/**
 * True when the `.` at `index` is a decimal point (a digit on both sides), such
 * as the dot in `6.82`. Decimal points must not end a sentence — splitting there
 * would let a citation anchor land inside the number, and the anchor's trailing
 * index digits would then merge with the fractional digits on the client.
 */
function isDecimalPoint(text: string, index: number): boolean {
  const prev = text[index - 1];
  const next = text[index + 1];
  return prev >= '0' && prev <= '9' && next >= '0' && next <= '9';
}

/** Matches a bare or markdown-link URL body; stops before whitespace or an enclosing `)`/`]`/quote so a `[text](url)` destination is captured without swallowing the closing paren. */
const URL_PATTERN = /https?:\/\/[^\s<>"'\])]+/gi;

/**
 * Trailing characters stripped off a matched URL before it's treated as a
 * no-split span. The greedy `URL_PATTERN` match has no way to tell a real
 * trailing character (an actual `.` in a path) from sentence punctuation that
 * merely follows the URL (`See https://example.com/report.pdf. Next.`) — real
 * URLs essentially never end in these characters, so they're always treated
 * as prose punctuation and left eligible for sentence splitting.
 */
const URL_TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * Byte-offset spans of every URL in `text`, so `.`/`!`/`?` inside a path or
 * query string (e.g. `report.pdf`) aren't mistaken for sentence boundaries. A
 * split there would let a citation anchor land inside the URL, truncating and
 * invalidating the link on the client. Trailing sentence punctuation is
 * trimmed off the match (see `URL_TRAILING_PUNCTUATION`) so a period right
 * after the URL still ends the sentence normally instead of being swallowed
 * into the no-split span.
 */
function computeUrlSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const pattern = new RegExp(URL_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const trimmedLength = match[0].replace(URL_TRAILING_PUNCTUATION, '').length;
    if (trimmedLength > 0) {
      spans.push([match.index, match.index + trimmedLength]);
    }
  }
  return spans;
}

function isInsideUrl(index: number, urlSpans: Array<[number, number]>): boolean {
  return urlSpans.some(([start, end]) => index >= start && index < end);
}

/**
 * Splits text into sentence-like segments losslessly — concatenating the result
 * reproduces the input exactly, so anchors can be inserted without altering
 * surrounding whitespace or punctuation.
 */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  const urlSpans = computeUrlSpans(text);
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isBoundary = char === '.' || char === '!' || char === '?' || char === '\n';
    if (!isBoundary) {
      continue;
    }

    if (char === '.' && isDecimalPoint(text, i)) {
      continue;
    }

    if (isInsideUrl(i, urlSpans)) {
      continue;
    }

    let end = i + 1;
    while (end < text.length && /[.!?"')\]\s]/.test(text[end])) {
      end += 1;
    }
    sentences.push(text.slice(start, end));
    start = end;
    i = end - 1;
  }

  if (start < text.length) {
    sentences.push(text.slice(start));
  }

  return sentences;
}

// Deloitte Custom Change: Exclude fenced code blocks (backtick and tilde) from citation
// anchoring so anchors never land inside artifact/code content and render as literal text.
/** A half-open `[start, end)` character range in the original text to exclude from anchoring. */
interface ExcludedRange {
  start: number;
  end: number;
}

/** Matches a fenced-code opening line: 3+ backticks or 3+ tildes, optionally followed by an info string. */
const FENCE_OPEN_LINE = /^(`{3,}|~{3,})(.*)$/;

/**
 * Matches a leading blockquote container prefix: one or more `>` markers (each with optional
 * surrounding whitespace), e.g. `"> "` or `"> > "` for a nested quote. List-item indentation
 * doesn't need an equivalent marker here — it's plain whitespace, already stripped below by
 * `trimStart()`.
 */
const BLOCKQUOTE_PREFIX = /^(?:[ \t]*>[ \t]?)+/;

/**
 * Counts the `>` markers in a matched `BLOCKQUOTE_PREFIX`, so two prefixes can be compared by
 * nesting depth instead of by exact string equality — CommonMark allows the single space after
 * each `>` to be omitted, so an opening fence's prefix (`"> "`) and its closing line's prefix
 * (`">"`) can differ in whitespace while still being the same blockquote depth.
 */
function countBlockquoteMarkers(prefix: string): number {
  return (prefix.match(/>/g) ?? []).length;
}

/**
 * Matches a list-item marker consumed on the fence's own opening line — e.g. `"- "`, `"* "`,
 * `"1. "`, `"12) "` — for a fence that opens immediately after the marker (`- \`\`\`js`) rather
 * than on an indented continuation line under the item.
 */
const LIST_MARKER_PREFIX = /^[ \t]{0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+/;

interface FenceOpen {
  char: string;
  length: number;
}

/**
 * Parses a candidate opening-fence line (already past any blockquote/list-marker container
 * prefix) into its delimiter character and run length, or `null` if the line isn't a valid
 * fence open. Per CommonMark, a backtick-fenced info string cannot itself contain a backtick
 * (it would be ambiguous with inline code spans); a tilde-fenced info string has no such
 * restriction. A fence may be indented at most 3 *spaces* beyond its container prefix — beyond
 * that it's indented code content, not a fence, so any further leading whitespace disqualifies
 * the line rather than being trimmed away unconditionally. A tab doesn't count toward that cap
 * as a single character: it expands to a full tab stop (commonly 4 columns), so even one leading
 * tab already exceeds the 3-space allowance and must disqualify the line, not be counted as "1".
 */
function matchFenceOpen(line: string): FenceOpen | null {
  const indent = line.match(/^ {0,3}/)?.[0].length ?? 0;
  const remainder = line.slice(indent);
  if (/^[ \t]/.test(remainder)) {
    return null;
  }

  const match = remainder.match(FENCE_OPEN_LINE);
  if (!match) {
    return null;
  }

  const fence = match[1];
  const info = match[2];
  const char = fence[0];
  if (char === '`' && info.includes('`')) {
    return null;
  }

  return { char, length: fence.length };
}

/**
 * Finds fenced-code-block ranges (absolute character offsets into `text`) so citation
 * anchors are never inserted inside them. An artifact body is always wrapped in a fence
 * (see `api/app/clients/prompts/artifacts.js`), and the frontend's citation renderer only
 * transforms markdown prose nodes, not fenced-code node content — an anchor placed inside
 * a fence would render as literal text (e.g. `turn0file0`) instead of a citation chip.
 *
 * Markdown recognizes both backtick and tilde fences, and the frontend renders both as code
 * nodes, so both must be tracked here. A closing fence must use the same delimiter character
 * as its opener and have at least as many characters, so a shorter nested fence inside an
 * artifact's body (e.g. a 3-backtick example inside its 4-backtick outer fence) doesn't
 * prematurely close the range, and a tilde fence can't be closed by a backtick run or vice
 * versa. When an opening fence has no matching close (a truncated stream), the excluded range
 * extends from the opening fence through the end of `text`.
 *
 * A fence can also sit inside a container — a blockquote or a list item — with the same
 * prefix repeated on every line of the block. Blockquote markers are `>` characters, matched
 * explicitly via `BLOCKQUOTE_PREFIX`, with the closing line required to carry the exact same
 * nesting depth (counted via `countBlockquoteMarkers`, not compared as a literal string, since
 * CommonMark allows the single space after each `>` to be omitted) — a shallower-quoted line
 * can't close a deeper fence, and a deeper-quoted line can't close a shallower one either, since
 * both mean the line sits at a different container depth than the fence it would be closing.
 * A list item's continuation lines carry no repeated marker, just indentation, but its
 * opening line may put the fence directly after the marker (e.g. `- \`\`\`js`); that one-time
 * marker is matched via `LIST_MARKER_PREFIX` before looking for the fence. Per CommonMark, a
 * list item's continuation lines must be indented to at least the marker's own width to remain
 * part of the item — code blocks don't get the lazy-continuation exception paragraphs do — so
 * a line that falls short ends the item there: the range stops at the last sufficiently
 * indented line, and that short line itself is re-scanned as ordinary top-level text (it may
 * even open its own, unrelated fence).
 *
 * Per CommonMark, a fence delimiter — opening or closing — may only be indented up to 3
 * spaces beyond its container prefix; beyond that it's still code content, not a fence. Both
 * `matchFenceOpen` and the closing-fence check enforce that cap explicitly (rather than
 * trimming all leading whitespace) so an over-indented delimiter-looking line is never
 * mistaken for a fence boundary — which would otherwise let a stray indented line pair with a
 * later, unrelated fence and swallow real prose (and its citations) in between.
 *
 * When no closing fence is found anywhere in the rest of the text (a stream truncated
 * mid-code-block), the range still extends to the end of the text — CommonMark renders an
 * unclosed fence as code through to the end of the document, so leaving it un-excluded would
 * let a citation anchor land inside what actually renders as a code block.
 */
function findFencedCodeRanges(text: string): ExcludedRange[] {
  const ranges: ExcludedRange[] = [];
  const lines = text.split('\n');
  const lineStarts: number[] = new Array(lines.length);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStarts[i] = offset;
    offset += lines[i].length + 1;
  }

  let i = 0;
  while (i < lines.length) {
    const blockquotePrefix = lines[i].match(BLOCKQUOTE_PREFIX)?.[0] ?? '';
    const blockquoteDepth = countBlockquoteMarkers(blockquotePrefix);
    const afterBlockquote = lines[i].slice(blockquotePrefix.length);
    const listMarkerPrefix = afterBlockquote.match(LIST_MARKER_PREFIX)?.[0] ?? '';
    const fenceOpen = matchFenceOpen(afterBlockquote.slice(listMarkerPrefix.length));
    if (!fenceOpen) {
      i += 1;
      continue;
    }

    const closeLineRegex = new RegExp(`^ {0,3}${fenceOpen.char}{${fenceOpen.length},}[ \t\r]*$`);
    const requiredIndent = listMarkerPrefix.length;
    let closeIndex = -1;
    let listItemEndIndex = -1;

    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      const linePrefix = blockquoteDepth > 0 ? (line.match(BLOCKQUOTE_PREFIX)?.[0] ?? '') : '';
      if (blockquoteDepth > 0 && countBlockquoteMarkers(linePrefix) !== blockquoteDepth) {
        continue;
      }

      const candidate = linePrefix ? line.slice(linePrefix.length) : line;

      if (requiredIndent > 0 && candidate.trim() !== '') {
        const lineIndent = candidate.match(/^[ \t]*/)?.[0].length ?? 0;
        if (lineIndent < requiredIndent) {
          listItemEndIndex = j;
          break;
        }
        if (closeLineRegex.test(candidate.slice(requiredIndent))) {
          closeIndex = j;
          break;
        }
        continue;
      }

      if (closeLineRegex.test(candidate)) {
        closeIndex = j;
        break;
      }
    }

    if (closeIndex !== -1) {
      ranges.push({
        start: lineStarts[i],
        end: lineStarts[closeIndex] + lines[closeIndex].length,
      });
      i = closeIndex + 1;
      continue;
    }

    if (listItemEndIndex !== -1) {
      const lastContentIndex = listItemEndIndex - 1;
      ranges.push({
        start: lineStarts[i],
        end: lineStarts[lastContentIndex] + lines[lastContentIndex].length,
      });
      i = listItemEndIndex;
      continue;
    }

    ranges.push({ start: lineStarts[i], end: text.length });
    break;
  }

  return ranges;
}

/** True when `offset` falls within any of `ranges` (few ranges per message — linear scan is fine). */
function isWithinRanges(offset: number, ranges: ExcludedRange[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function containment(sentenceTokens: Set<string>, passageTokens: Set<string>): number {
  if (sentenceTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of sentenceTokens) {
    if (passageTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / sentenceTokens.size;
}

/**
 * Chooses the citation anchors for a single sentence. Each passage is scored by
 * `containment`, weak matches (< `threshold`) are dropped, and the
 * remaining passages are deduped to the best score per source. The result is the
 * top `MAX_ANCHORS_PER_SENTENCE` — the distinct sources whose best passage most
 * strongly overlaps the sentence. `coords` are `"turn:fileIndex"` keys — the same
 * coordinates used elsewhere to track which MCP sources a lexical match already
 * covered (see `appendGuaranteedMCPCitations`).
 */
function anchorsForSentence(
  sentence: string,
  passages: Passage[],
  options: {
    threshold?: number;
    tokenizeFn?: (text: string) => string[];
    anchorTag?: string;
    excludeCoords?: Set<string>;
  } = {},
): { anchors: string[]; coords: string[] } {
  const {
    threshold = SIMILARITY_THRESHOLD,
    tokenizeFn = tokenize,
    anchorTag = 'file',
    excludeCoords,
  } = options;
  const sentenceTokens = new Set(tokenizeFn(sentence));
  if (sentenceTokens.size < MIN_SENTENCE_CONTENT_WORDS) {
    return { anchors: [], coords: [] };
  }

  const bestByCoord = new Map<string, { turn: number; fileIndex: number; score: number }>();
  for (const passage of passages) {
    const key = `${passage.turn}:${passage.fileIndex}`;
    if (excludeCoords?.has(key)) {
      continue;
    }
    const score = containment(sentenceTokens, passage.tokens);
    if (score < threshold) {
      continue;
    }
    const existing = bestByCoord.get(key);
    if (!existing || score > existing.score) {
      bestByCoord.set(key, { turn: passage.turn, fileIndex: passage.fileIndex, score });
    }
  }

  const top = Array.from(bestByCoord.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, MAX_ANCHORS_PER_SENTENCE);

  return {
    anchors: top.map(
      ([, { turn, fileIndex }]) => `${ANCHOR_MARKER}turn${turn}${anchorTag}${fileIndex}`,
    ),
    coords: top.map(([key]) => key),
  };
}

function withAnchors(sentence: string, anchors: string[]): string {
  if (anchors.length === 0) {
    return sentence;
  }
  const trimmed = sentence.replace(/\s+$/, '');
  const trailing = sentence.slice(trimmed.length);
  return `${trimmed} ${anchors.join(' ')}${trailing}`;
}

/**
 * Anchors a single text blob against `passages`, line by line. A line that parses as a markdown
 * table row (via `splitTableRowCells`) is scored as one unit and its anchors are inserted into the
 * last non-empty cell, preserving column count — the same placement `insertSharePointCitations`
 * uses. Every other line (prose, or a table separator row, which `splitTableRowCells` also treats
 * as non-data) falls back to the existing sentence-boundary pass. Splitting/rejoining on `\n` is
 * always lossless, so this never alters surrounding whitespace beyond the anchors themselves.
 */
function anchorTextPart(
  text: string,
  passages: Passage[],
  options: {
    threshold?: number;
    tokenizeFn?: (text: string) => string[];
    anchorTag?: string;
    scoreExcludedRanges?: boolean;
  },
): { text: string; usedCoords: Set<string> } {
  const usedCoords = new Set<string>();
  const lines = text.split('\n');
  const excludedRanges = findFencedCodeRanges(text);
  let cursor = 0;
  const inFence = lines.map((line) => {
    const lineStart = cursor;
    cursor += line.length + 1;
    return isWithinRanges(lineStart, excludedRanges);
  });
  const tableLineIndices = computeTableLineIndices(lines);
  const { scoreExcludedRanges = false, ...anchorOptions } = options;

  const rebuiltLines = lines.map((line, index) => {
    const excluded = inFence[index];
    if (excluded && !scoreExcludedRanges) {
      return line;
    }

    const lineCoords = new Set<string>();
    const tableRow =
      !excluded && tableLineIndices.has(index) ? splitTableRowCells(line) : undefined;

    if (tableRow) {
      const { anchors, coords } = anchorsForSentence(line, passages, {
        ...anchorOptions,
        excludeCoords: lineCoords,
      });
      coords.forEach((coord) => usedCoords.add(coord));
      if (anchors.length === 0) {
        return line;
      }
      const lastCellIndex = findLastNonEmptyCellIndex(tableRow.cells);
      if (lastCellIndex === -1) {
        return line;
      }
      tableRow.cells[lastCellIndex] = withAnchors(tableRow.cells[lastCellIndex], anchors);
      return joinTableRowCells(tableRow);
    }

    return splitIntoSentences(line)
      .map((sentence) => {
        const { anchors, coords } = anchorsForSentence(sentence, passages, {
          ...anchorOptions,
          excludeCoords: lineCoords,
        });
        coords.forEach((coord) => {
          usedCoords.add(coord);
          lineCoords.add(coord);
        });
        return excluded ? sentence : withAnchors(sentence, anchors);
      })
      .join('');
  });

  return { text: rebuiltLines.join('\n'), usedCoords };
}

function findLastTextPart(contentParts: TMessageContentParts[]): TMessageContentParts | undefined {
  for (let i = contentParts.length - 1; i >= 0; i--) {
    const text = readText(contentParts[i]);
    if (text != null && text.length > 0) {
      return contentParts[i];
    }
  }
  return undefined;
}

function readText(part: TMessageContentParts): string | null {
  if (part == null || part.type !== ContentTypes.TEXT) {
    return null;
  }
  const { text } = part;
  if (typeof text === 'string') {
    return text;
  }
  if (text && typeof text.value === 'string') {
    return text.value;
  }
  return null;
}

function writeText(part: TMessageContentParts, value: string): void {
  if (part == null || part.type !== ContentTypes.TEXT) {
    return;
  }
  if (typeof part.text === 'string') {
    part.text = value;
    return;
  }
  if (part.text && typeof part.text === 'object') {
    part.text.value = value;
  }
}

/**
 * Deterministically inserts file citation anchors into the assistant's text
 * content parts by matching each sentence against the retrieved file_search
 * passages. Mutates the content parts in place. Pure and synchronous.
 *
 * A sentence sitting inside a fenced code block (e.g. an artifact body) is
 * never anchored — the frontend's citation renderer only transforms markdown
 * prose nodes, not fenced-code node content, so an anchor placed there would
 * render as literal text (e.g. `turn0file0`) instead of a citation chip.
 */
export function insertFileCitations(
  contentParts: TMessageContentParts[],
  fileSearchAttachments: TAttachment[],
): void {
  const passages = buildPassages(fileSearchAttachments);
  if (passages.length === 0) {
    return;
  }

  for (const part of contentParts) {
    const text = readText(part);
    if (text == null || text.length === 0) {
      continue;
    }

    const { text: rebuilt } = anchorTextPart(text, passages, {});
    if (rebuilt !== text) {
      writeText(part, rebuilt);
    }
  }
}

function extractWebSearchData(attachment: TAttachment): SearchResultData | undefined {
  return attachment[Tools.web_search];
}

/**
 * Builds passage lists for web_search organic and news results, keyed by each attachment's own
 * `turn` value — already assigned upstream (the same value `useSearchResultsByTurn` keys the
 * client's turnMap by) — rather than a fresh counter, so anchors line up with the turn numbering
 * the client already resolves.
 *
 * Tokenized with `tokenizeStemmed`, the same as `buildMCPPassages` — organic/news results are
 * short, loosely-paraphrased article excerpts, not long chunks the model quotes closely like
 * file_search, so they need the looser MCP-style matching profile, not the strict one.
 */
function buildWebSearchPassages(webSearchAttachments: TAttachment[]): {
  organic: Passage[];
  news: Passage[];
} {
  const organic: Passage[] = [];
  const news: Passage[] = [];

  for (const attachment of webSearchAttachments) {
    const data = extractWebSearchData(attachment);
    if (!data || typeof data.turn !== 'number') {
      continue;
    }
    const turn = data.turn;

    data.organic?.forEach((result, fileIndex) => {
      const tokens = new Set(
        tokenizeStemmed(`${result.title ?? ''} ${result.content ?? result.snippet ?? ''}`),
      );
      if (tokens.size > 0) {
        organic.push({ turn, fileIndex, tokens });
      }
    });

    data.topStories?.forEach((result, fileIndex) => {
      const tokens = new Set(tokenizeStemmed(`${result.title ?? ''} ${result.content ?? ''}`));
      if (tokens.size > 0) {
        news.push({ turn, fileIndex, tokens });
      }
    });
  }

  return { organic, news };
}

/**
 * Deterministically inserts web search citation anchors (`turn{N}search{M}`/`turn{N}news{M}`)
 * into the assistant's text content parts by matching each sentence against the organic/news
 * results, the same lexical approach `insertMCPCitations` uses for article-style sources
 * (stemmed tokens, `MCP_SIMILARITY_THRESHOLD`) rather than `insertFileCitations`'s strict
 * profile — a heading that echoes a source's title verbatim will always clear a strict
 * threshold, while paraphrased body claims further down the response won't, silently starving
 * them of citations. Mutates in place.
 *
 * Scoped to organic and news results only — both carry real paraphrasable body text (title +
 * snippet/scraped content), so lexical matching works the same way it does for MCP article
 * sources. Images/videos have no body text to match against and remain model-cited (see the
 * image/video escape-sequence instructions retained in `buildWebSearchContext`).
 */
export function insertWebSearchCitations(
  contentParts: TMessageContentParts[],
  webSearchAttachments: TAttachment[],
): void {
  const { organic, news } = buildWebSearchPassages(webSearchAttachments);

  for (const [passages, anchorTag] of [
    [organic, 'search'],
    [news, 'news'],
  ] as const) {
    if (passages.length === 0) {
      continue;
    }
    for (const part of contentParts) {
      const text = readText(part);
      if (text == null || text.length === 0) {
        continue;
      }
      const { text: rebuilt } = anchorTextPart(text, passages, {
        anchorTag,
        threshold: MCP_SIMILARITY_THRESHOLD,
        tokenizeFn: tokenizeStemmed,
      });
      if (rebuilt !== text) {
        writeText(part, rebuilt);
      }
    }
  }
}

/**
 * Builds MCP passages for sentence-level matching, offset so MCP turn numbers
 * don't collide with file_search turn numbers in the client's shared turnMap.
 */
function buildMCPPassages(mcpAttachments: TAttachment[], turnOffset: number): Passage[] {
  const passages: Passage[] = [];
  let turn = turnOffset;
  for (const attachment of mcpAttachments) {
    const payload = attachment[Tools.mcp_results] as { sources?: MCPResultSource[] } | undefined;
    if (!payload?.sources) {
      continue;
    }
    payload.sources.forEach((source, fileIndex) => {
      const tokens = new Set(tokenizeStemmed(source.content ?? ''));
      if (tokens.size > 0) {
        passages.push({ turn, fileIndex, tokens });
      }
    });
    turn += 1;
  }
  return passages;
}

/**
 * Inserts MCP citation anchors (`turn{N}mcp0`) into assistant text parts by
 * matching each sentence against the MCP tool result content, using the more
 * lenient `MCP_SIMILARITY_THRESHOLD`. Mutates in place. Returns the
 * `"turn:fileIndex"` coordinates that matched, so callers can detect sources
 * the lexical pass missed entirely (see `appendGuaranteedMCPCitations`) — a
 * sentence inside an excluded (fenced-code) range still contributes its
 * coordinate here even though no anchor is written for it, so a source
 * mentioned only inside a fence isn't force-cited again outside it.
 *
 * A source already anchored earlier on the same line is excluded from later
 * sentences on that line (reset at each `\n`). A single source's content can
 * legitimately overlap several sentence-splitter fragments within one
 * rendered bullet/paragraph — e.g. a filename's extension period splits it
 * into an extra fragment — which would otherwise stack duplicate citations
 * of the same source on what the user reads as one point.
 */
export function insertMCPCitations(
  contentParts: TMessageContentParts[],
  mcpAttachments: TAttachment[],
  turnOffset: number,
): Set<string> {
  const usedCoords = new Set<string>();
  const passages = buildMCPPassages(mcpAttachments, turnOffset);
  if (passages.length === 0) {
    return usedCoords;
  }

  for (const part of contentParts) {
    const text = readText(part);
    if (text == null || text.length === 0) {
      continue;
    }

    // Score sentences inside an excluded (fenced) range too, so a source matched only there is
    // marked used and doesn't get force-appended later by appendGuaranteedMCPCitations — but
    // never insert the anchor markup, since it would render as literal text inside the fence.
    const { text: rebuilt, usedCoords: partCoords } = anchorTextPart(text, passages, {
      threshold: MCP_SIMILARITY_THRESHOLD,
      tokenizeFn: tokenizeStemmed,
      anchorTag: 'mcp',
      scoreExcludedRanges: true,
    });
    partCoords.forEach((coord) => usedCoords.add(coord));

    if (rebuilt !== text) {
      writeText(part, rebuilt);
    }
  }

  return usedCoords;
}

/**
 * Deloitte Custom Change
 * Force-appends a citation anchor for every disclaimer- or usage-restricted
 * SharePoint MCP source that wasn't already anchored by the lexical
 * `insertMCPCitations` pass — so those sources are always cited, not only
 * when the model's phrasing happened to overlap them. Scoped to a source's
 * own `usageRestriction` flag (KX quals or DPN profiles specifically — not
 * every source in an attachment that merely contains one DPN hit) or the
 * attachment's top-level `disclaimer`, plus SharePoint sources, rather than
 * every MCP toolset: a source that never surfaces in the answer at all (e.g. an
 * AFR/feed/entity search hit the model chose not to discuss) should not get a
 * citation chip for text the user never reads about. Mirrors the exact
 * turn-advancement rule `useSearchResultsByTurn` depends on: the turn counter
 * advances for every attachment whose `sources` array is present, even an
 * empty one.
 */
export function appendGuaranteedMCPCitations(
  contentParts: TMessageContentParts[],
  mcpAttachments: TAttachment[],
  turnOffset: number,
  usedCoords: Set<string>,
): void {
  const missingAnchors: string[] = [];
  let turn = turnOffset;
  for (const attachment of mcpAttachments) {
    const payload = attachment[Tools.mcp_results] as
      | { sources?: MCPResultSource[]; disclaimer?: string }
      | undefined;
    if (!payload?.sources) {
      continue;
    }
    const hasDisclaimer = Boolean(payload.disclaimer);
    payload.sources.forEach((source, fileIndex) => {
      const requiresAnchor = hasDisclaimer || Boolean(source.usageRestriction);
      if (!requiresAnchor && !isSharePointSource(source)) {
        return;
      }
      const coord = `${turn}:${fileIndex}`;
      if (!usedCoords.has(coord)) {
        missingAnchors.push(`${ANCHOR_MARKER}turn${turn}mcp${fileIndex}`);
      }
    });
    turn += 1;
  }

  if (missingAnchors.length === 0) {
    return;
  }

  const targetPart = findLastTextPart(contentParts);
  if (!targetPart) {
    return;
  }
  const text = readText(targetPart) ?? '';
  writeText(targetPart, withAnchors(text, missingAnchors));
}

/** Tool-name prefix identifying SharePoint MCP results (see `packages/api/src/mcp/sharepoint/sharepoint.ts` and `KNOWN_MCP_TOOLSET_PREFIXES` in `feed.ts`). */
const SHAREPOINT_TOOL_PREFIX = 'sp_';

/** The only SharePoint tool whose `content` is a document's full extracted text rather than a short filename/URL listing entry. */
const SHAREPOINT_CONTENT_TOOL = 'sp_read_file';

function isSharePointSource(source: MCPResultSource): boolean {
  return source.toolName?.startsWith(SHAREPOINT_TOOL_PREFIX) ?? false;
}

/**
 * True for `sp_search`/`sp_list_*`/`sp_get_*`-style sources: short
 * filename+URL entries. Their `content` is unsafe input for the lexical
 * pass's sentence splitter, which breaks at every period — including ones
 * inside a listed file's URL or `.ext` — so a listing source that
 * `insertSharePointCitations`'s line-matcher didn't anchor must still be
 * excluded from the lexical fallback, not handed to it.
 */
function isSharePointListingSource(source: MCPResultSource): boolean {
  return isSharePointSource(source) && source.toolName !== SHAREPOINT_CONTENT_TOOL;
}

/**
 * Strips a leading list marker (`-`, `*`, `•`, `1.`) and markdown bold, so a
 * rendered bullet line can be compared directly against a raw source title.
 */
function stripLineMarkers(line: string): string {
  return line
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim();
}

/** Matches a markdown table separator row (`| --- | :--: |`), which has no source names to match against. */
const TABLE_SEPARATOR_LINE = /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/;

/**
 * A table row's cells plus which edge pipes the original line actually had, so a caller that
 * rebuilds the row can reproduce the exact same leading/trailing pipe formatting instead of
 * always adding both. `prefix`/`suffix` are the whitespace trimmed off the original line
 * (indentation, trailing spaces, a CRLF's `\r`) so the rebuilt line reproduces it exactly instead
 * of silently normalizing it away.
 */
interface TableRowCells {
  cells: string[];
  hasLeadingPipe: boolean;
  hasTrailingPipe: boolean;
  prefix: string;
  suffix: string;
}

/**
 * True when the `|` at `index` is a real column separator, not a backslash-escaped literal pipe
 * (`Value \| detail`). Counts consecutive backslashes immediately before it: an even count (zero
 * included) leaves the pipe unescaped, an odd count means the last backslash escapes it.
 */
function isUnescapedPipeAt(text: string, index: number): boolean {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && text[i] === '\\') {
    backslashes += 1;
    i -= 1;
  }
  return backslashes % 2 === 0;
}

/**
 * Splits `text` on unescaped `|` characters only, so a literal `\|` inside a cell (GFM's escape
 * for a pipe that shouldn't act as a column boundary) stays part of that cell's content instead of
 * being mistaken for a separator.
 */
function splitUnescapedPipes(text: string): string[] {
  const cells: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && isUnescapedPipeAt(text, i)) {
      cells.push(text.slice(start, i));
      start = i + 1;
    }
  }
  cells.push(text.slice(start));
  return cells;
}

/**
 * Splits a markdown table row (`| a | b |`) into its cell contents, or returns undefined if the
 * line isn't a table row (including separator rows), so a SharePoint or file_search answer
 * rendered as a table can still be matched cell-by-cell the same way a bulleted line is matched
 * whole. Only used on lines a caller has already confirmed sit inside a real GFM table block (see
 * `computeTableLineIndices`) — this function only knows a single line's shape, not whether it's
 * actually part of a table, so any pipe-containing prose, shell command, or fenced code line would
 * otherwise look identical to a genuine row.
 *
 * GFM permits omitting the leading and/or trailing pipe on a multi-column row (`File | Summary`
 * is as valid as `| File | Summary |`), so a row qualifies either when both edge pipes are present
 * (covers single-column rows, which need both to be unambiguous) or when at least one unescaped
 * `|` separates cells in the interior — a lone stray `|` (escaped or with nothing to separate) is
 * not a table row.
 */
function splitTableRowCells(line: string): TableRowCells | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || TABLE_SEPARATOR_LINE.test(trimmed)) {
    return undefined;
  }
  const hasLeadingPipe = trimmed.startsWith('|');
  const hasTrailingPipe =
    trimmed.length > 1 && trimmed.endsWith('|') && isUnescapedPipeAt(trimmed, trimmed.length - 1);
  const core = trimmed.slice(hasLeadingPipe ? 1 : 0, hasTrailingPipe ? -1 : undefined);
  const cells = splitUnescapedPipes(core);
  if (!(hasLeadingPipe && hasTrailingPipe) && cells.length < 2) {
    return undefined;
  }
  const prefix = line.slice(0, line.indexOf(trimmed));
  const suffix = line.slice(prefix.length + trimmed.length);
  return { cells, hasLeadingPipe, hasTrailingPipe, prefix, suffix };
}

/**
 * Identifies which lines of a lossless `\n`-split belong to a real GFM table block, so a line
 * merely containing a pipe — prose, a shell command, fenced code, or markdown streamed so far that
 * only has a header — is never mistaken for a table row. GFM requires a delimiter row
 * (`| --- | --- |`) directly under the header to recognize a table at all; once one is found, the
 * header and delimiter are marked, and contiguous following lines that themselves look like table
 * rows extend the block until the first blank line or non-row line.
 */
function computeTableLineIndices(lines: string[]): Set<number> {
  const tableLines = new Set<number>();
  for (let i = 1; i < lines.length; i++) {
    if (tableLines.has(i) || !TABLE_SEPARATOR_LINE.test(lines[i].trim())) {
      continue;
    }
    const headerIndex = i - 1;
    if (tableLines.has(headerIndex) || !splitTableRowCells(lines[headerIndex])) {
      continue;
    }
    tableLines.add(headerIndex);
    tableLines.add(i);
    let j = i + 1;
    while (j < lines.length && splitTableRowCells(lines[j])) {
      tableLines.add(j);
      j += 1;
    }
  }
  return tableLines;
}

/**
 * Rebuilds a table row from `splitTableRowCells`'s output, restoring the edge pipes and the
 * leading/trailing whitespace (including a CRLF's `\r`) the original line had.
 */
function joinTableRowCells({
  cells,
  hasLeadingPipe,
  hasTrailingPipe,
  prefix,
  suffix,
}: TableRowCells): string {
  return `${prefix}${hasLeadingPipe ? '|' : ''}${cells.join('|')}${hasTrailingPipe ? '|' : ''}${suffix}`;
}

/** Index of the last non-blank cell, or -1 if every cell is empty — the safe place to append an anchor without disturbing column count. */
function findLastNonEmptyCellIndex(cells: string[]): number {
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].trim().length > 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Lowercases and collapses `_`/`-`/whitespace runs to a single space, so
 * titles and rendered lines compare equal despite cosmetic differences the
 * model introduces when restating a name (e.g. `6.2.0_Release` vs
 * `6.2.0 Release`).
 */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * True when `text` starts with `alias` and the alias ends there — the next
 * character (if any) is not a letter/digit. A plain `startsWith` would let a
 * short title like "Archive" consume an unrelated line like "Archived files"
 * just because it's a string prefix. Requiring a boundary still allows the
 * intended "title plus commentary" match (`- Foo.pptx – last modified today`),
 * since a space or punctuation always follows the title there.
 */
function startsWithAliasBoundary(text: string, alias: string): boolean {
  if (!text.startsWith(alias)) {
    return false;
  }
  const nextChar = text[alias.length];
  return nextChar === undefined || !/[a-z0-9]/i.test(nextChar);
}

/** Strips a real file extension (`.xlsx`, `.docx`, `.loop`, ...) off a title, or returns undefined if it has none. */
function stripExtension(title: string): string | undefined {
  const match = title.match(/^(.+)\.([a-z0-9]{1,6})$/i);
  if (!match || !/[a-z]/i.test(match[2])) {
    return undefined;
  }
  return match[1];
}

interface SharePointTitleCoord {
  turn: number;
  fileIndex: number;
}

/**
 * Dequeues the next unused source for a matched alias, so when several
 * sources share the exact same title (e.g. the same filename uploaded to
 * different folders), each successive line that matches it is credited to
 * a distinct source — in the same order those sources appeared in the tool
 * result — instead of every occurrence pointing at the first duplicate.
 */
function nextCoordForAlias(
  aliasQueues: Map<string, SharePointTitleCoord[]>,
  alias: string,
): SharePointTitleCoord | undefined {
  const queue = aliasQueues.get(alias);
  return queue && queue.length > 0 ? queue.shift() : undefined;
}

/**
 * Inserts citation anchors for SharePoint MCP sources by matching each line
 * against source titles, instead of the sentence-boundary heuristic
 * `insertMCPCitations` uses. SharePoint answers are rendered as bulleted
 * filename/folder lists, not paraphrased prose, and `splitIntoSentences`
 * splits on `.`, which fractures a filename at its extension's period
 * (`report.pdf` -> `report` + `pdf`), misplacing the anchor and dropping
 * short names below `MIN_SENTENCE_CONTENT_WORDS`.
 *
 * A line is anchored when it *starts with* a source title (after stripping
 * bullet/bold markers and normalizing case/punctuation) — not exact-equals —
 * because the model frequently appends commentary after the name (`- Foo.pptx
 * – last modified today`, `- Foo documentation`) or swaps the extension for a
 * trailing parenthetical (`- Foo (xlsx)`), which an exact-line match misses.
 * Each title also registers an extension-stripped alias to catch the latter.
 * When more than one title prefixes the same line, the longest (most
 * specific) one wins, so a short generic title (e.g. a folder literally named
 * "Release") can't steal credit from a longer, more specific one that also
 * matches (e.g. "Release Announcements"). Requiring a prefix match (not a
 * substring) still keeps prose that merely *mentions* a filename mid-sentence
 * from getting a spurious anchor.
 *
 * A markdown table row (`| Foo.pptx | Site | Date |`) is matched cell-by-cell
 * instead of whole-line, since the model just as often renders SharePoint
 * results as a table as a bulleted list, and a title normally sits alone in
 * one cell rather than at the very start of the row. The anchor is appended
 * inside the matched cell so the row's column count — and the table's
 * rendering — stays intact.
 *
 * When several sources share the exact same title (e.g. the same filename
 * uploaded to different folders), each is registered on a per-alias queue in
 * source order; a line/cell match dequeues the next one, so the Nth line
 * mentioning that title is credited to the Nth source with that title,
 * instead of every occurrence pointing at the same duplicate.
 *
 * Scoped to sources whose `toolName` starts with `sp_` so every other MCP
 * connector keeps using the existing lexical pass unchanged. Returns the
 * `"turn:fileIndex"` coordinates it matched, in the same format
 * `insertMCPCitations` returns, so the caller can merge them into the same
 * `usedCoords` set — a title matched on a line inside an excluded (fenced-code)
 * range still contributes its coordinate here even though no anchor is
 * written for it, so `appendGuaranteedMCPCitations` doesn't force-cite that
 * source again outside the fence.
 */
export function insertSharePointCitations(
  contentParts: TMessageContentParts[],
  mcpAttachments: TAttachment[],
  turnOffset: number,
): Set<string> {
  const usedCoords = new Set<string>();
  const aliasQueues = new Map<string, SharePointTitleCoord[]>();

  const registerAlias = (alias: string, coord: SharePointTitleCoord): void => {
    const queue = aliasQueues.get(alias);
    if (queue) {
      queue.push(coord);
    } else {
      aliasQueues.set(alias, [coord]);
    }
  };

  let turn = turnOffset;
  for (const attachment of mcpAttachments) {
    const payload = attachment[Tools.mcp_results];
    if (!payload?.sources) {
      continue;
    }
    payload.sources.forEach((source, fileIndex) => {
      if (!source.title || !isSharePointSource(source)) {
        return;
      }
      const coord: SharePointTitleCoord = { turn, fileIndex };
      const fullAlias = normalizeForMatch(source.title);
      registerAlias(fullAlias, coord);
      const fullQueue = aliasQueues.get(fullAlias);
      const withoutExtension = stripExtension(source.title);
      if (withoutExtension) {
        const extensionStrippedAlias = normalizeForMatch(withoutExtension);
        if (extensionStrippedAlias !== fullAlias) {
          const existingQueue = aliasQueues.get(extensionStrippedAlias);
          if (existingQueue !== fullQueue) {
            if (existingQueue) {
              registerAlias(extensionStrippedAlias, coord);
            } else if (fullQueue) {
              aliasQueues.set(extensionStrippedAlias, fullQueue);
            }
          }
        }
      }
    });
    turn += 1;
  }

  if (aliasQueues.size === 0) {
    return usedCoords;
  }
  const sortedAliases = Array.from(aliasQueues.keys()).sort((a, b) => b.length - a.length);

  for (const part of contentParts) {
    const text = readText(part);
    if (text == null || text.length === 0) {
      continue;
    }

    let changed = false;
    const excludedRanges = findFencedCodeRanges(text);
    const lines = text.split('\n');
    let cursor = 0;
    const withinExcludedRange = lines.map((line) => {
      const lineStart = cursor;
      cursor += line.length + 1;
      return isWithinRanges(lineStart, excludedRanges);
    });
    const tableLineIndices = computeTableLineIndices(lines);

    const matchLine = (line: string, index: number, insertAnchor: boolean): string => {
      const tableRow = tableLineIndices.has(index) ? splitTableRowCells(line) : undefined;
      if (tableRow) {
        const { cells: tableCells } = tableRow;
        let rowChanged = false;
        for (let cellIndex = 0; cellIndex < tableCells.length; cellIndex++) {
          const normalizedCell = normalizeForMatch(stripLineMarkers(tableCells[cellIndex]));
          if (!normalizedCell) {
            continue;
          }
          for (const alias of sortedAliases) {
            if (!startsWithAliasBoundary(normalizedCell, alias)) {
              continue;
            }
            const coord = nextCoordForAlias(aliasQueues, alias);
            if (!coord) {
              continue;
            }
            usedCoords.add(`${coord.turn}:${coord.fileIndex}`);
            if (insertAnchor) {
              changed = true;
              rowChanged = true;
              tableCells[cellIndex] = withAnchors(tableCells[cellIndex], [
                `${ANCHOR_MARKER}turn${coord.turn}mcp${coord.fileIndex}`,
              ]);
            }
            break;
          }
        }
        return rowChanged ? joinTableRowCells(tableRow) : line;
      }

      const base = stripLineMarkers(line);
      if (!base) {
        return line;
      }
      const normalizedLine = normalizeForMatch(base);

      for (const alias of sortedAliases) {
        if (!startsWithAliasBoundary(normalizedLine, alias)) {
          continue;
        }
        const coord = nextCoordForAlias(aliasQueues, alias);
        if (!coord) {
          continue;
        }
        usedCoords.add(`${coord.turn}:${coord.fileIndex}`);
        if (!insertAnchor) {
          return line;
        }
        changed = true;
        return withAnchors(line, [`${ANCHOR_MARKER}turn${coord.turn}mcp${coord.fileIndex}`]);
      }
      return line;
    };

    // Claim queued sources for visible prose lines first, in document order, before any
    // fenced-code line gets a chance to — so a filename appearing both inside a fence and later
    // in prose still credits (and anchors) the prose mention instead of the fence silently
    // consuming the only queued source. Fenced lines are matched in a second pass purely to mark
    // any leftover source as used, without writing an anchor, so a source mentioned only inside a
    // fence still isn't force-appended later by appendGuaranteedMCPCitations.
    const rebuiltLines = lines.map((line, index) =>
      withinExcludedRange[index] ? line : matchLine(line, index, true),
    );
    lines.forEach((line, index) => {
      if (withinExcludedRange[index]) {
        matchLine(line, index, false);
      }
    });

    if (changed) {
      writeText(part, rebuiltLines.join('\n'));
    }
  }

  return usedCoords;
}

/**
 * Appends a deterministic trailing disclaimer paragraph whenever any MCP
 * attachment warrants one — a fixed, branded message rather than KX's own
 * boilerplate text. Two independent triggers share the same paragraph, since
 * a turn can carry either or both: any attachment with a `disclaimer` (KX's
 * own `usage_guidelines`, typically surfaced for quals-type results), or any
 * attachment flagged `dpnUsageRestriction` (a DPN people-profile result).
 * Always appends to an existing text part — never creates a new one — so
 * downstream content-part filtering can't drop it. The guidelines link falls
 * back to `DEFAULT_KX_USAGE_GUIDELINES_URL` when `KX_USAGE_GUIDELINES_URL`
 * isn't configured, so the default `.env.example` setup never renders
 * non-clickable placeholder text.
 */
export function appendMCPDisclaimers(
  contentParts: TMessageContentParts[],
  mcpAttachments: TAttachment[],
  mcpUsageGuidelinesUrl?: string,
): void {
  let hasDisclaimer = false;
  for (const attachment of mcpAttachments) {
    const payload = attachment[Tools.mcp_results] as
      | { disclaimer?: string; dpnUsageRestriction?: boolean }
      | undefined;
    hasDisclaimer =
      hasDisclaimer || Boolean(payload?.disclaimer) || Boolean(payload?.dpnUsageRestriction);
  }

  if (!hasDisclaimer) {
    return;
  }

  const targetPart = findLastTextPart(contentParts);
  if (!targetPart) {
    return;
  }

  const guidelinesText = `[KX usage guidelines](${mcpUsageGuidelinesUrl || DEFAULT_KX_USAGE_GUIDELINES_URL})`;
  const disclaimer =
    'Please note that this response uses data from the KX and DPN Connector. Review the accuracy ' +
    `of all KX and DPN citations before reusing them. See the ${guidelinesText} to learn more.`;

  const text = readText(targetPart) ?? '';
  writeText(targetPart, `${text}\n\n${disclaimer}`);
}

/**
 * End-of-trace citation step: resolves the run's artifact promises, isolates the
 * file_search and mcp_results attachments, and inserts citation anchors into the
 * final answer. Never throws — a citation failure must leave the answer intact.
 */
export async function applyEndOfTraceCitations({
  contentParts,
  artifactPromises,
  fileCitations,
  mcpUsageGuidelinesUrl,
  logger,
}: {
  contentParts?: TMessageContentParts[];
  artifactPromises?: Array<Promise<TAttachment | null> | undefined>;
  fileCitations?: boolean;
  mcpUsageGuidelinesUrl?: string;
  logger?: Logger;
}): Promise<void> {
  if (fileCitations === false) {
    return;
  }
  if (!Array.isArray(contentParts) || contentParts.length === 0) {
    return;
  }
  if (!Array.isArray(artifactPromises) || artifactPromises.length === 0) {
    return;
  }

  try {
    const resolved = await Promise.all(artifactPromises);
    const fileSearchAttachments = resolved.filter(
      (attachment): attachment is TAttachment =>
        attachment != null && attachment.type === Tools.file_search,
    );
    const mcpAttachments = resolved.filter(
      (attachment): attachment is TAttachment =>
        attachment != null && attachment.type === Tools.mcp_results,
    );
    const webSearchAttachments = resolved.filter(
      (attachment): attachment is TAttachment =>
        attachment != null && attachment.type === Tools.web_search,
    );

    if (fileSearchAttachments.length > 0) {
      insertFileCitations(contentParts, fileSearchAttachments);
    }
    if (webSearchAttachments.length > 0) {
      insertWebSearchCitations(contentParts, webSearchAttachments);
    }
    if (mcpAttachments.length > 0) {
      const turnOffset = fileSearchAttachments.length;
      const usedCoords = insertSharePointCitations(contentParts, mcpAttachments, turnOffset);
      // Listing sources (sp_search/sp_list_*/sp_get_*) always skip the lexical pass —
      // their short filename+URL content isn't safe input for a sentence splitter that
      // breaks on periods, so one that the line-matcher missed should get no citation, not a
      // garbled one. A `sp_read_file` source only skips the lexical pass if the
      // line-matcher already anchored it (avoids double-citing); otherwise — e.g. answered
      // as prose/a table instead of a filename-prefixed line — it still gets a shot at the
      // lexical/token-overlap pass, same as every other MCP connector.
      let turnCursor = turnOffset;
      const lexicalPassAttachments = mcpAttachments.map((attachment) => {
        const payload = attachment[Tools.mcp_results];
        if (!payload?.sources) {
          return attachment;
        }
        const turnNum = turnCursor;
        turnCursor += 1;
        const sources = payload.sources.map((source, fileIndex) => {
          if (isSharePointListingSource(source)) {
            return { ...source, content: '' };
          }
          if (!isSharePointSource(source) || !usedCoords.has(`${turnNum}:${fileIndex}`)) {
            return source;
          }
          return { ...source, content: '' };
        });
        return { ...attachment, [Tools.mcp_results]: { ...payload, sources } };
      });
      insertMCPCitations(contentParts, lexicalPassAttachments, turnOffset).forEach((coord) =>
        usedCoords.add(coord),
      );
      appendGuaranteedMCPCitations(contentParts, lexicalPassAttachments, turnOffset, usedCoords);
      appendMCPDisclaimers(contentParts, mcpAttachments, mcpUsageGuidelinesUrl);
    }
  } catch (error) {
    logger?.error('[applyEndOfTraceCitations] Failed to insert citations:', error);
  }
}
