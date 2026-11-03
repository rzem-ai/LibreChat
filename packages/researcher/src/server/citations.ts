/**
 * Inline citation markers. A draft cites with `[[cite:<snapshotId>]]` or
 * `[[cite:<snapshotId>#<locator>]]`; the verifier reads them back and the report
 * renders them as numbered references.
 */

export type CitationRef = { snapshotId: string; locator?: string };

export type CitedSentence = {
  /** Sentence text with markers removed, normalised to end on its own punctuation. */
  text: string;
  citations: CitationRef[];
  /** Span in the source draft covering the sentence and its trailing markers. */
  start: number;
  end: number;
};

/** Snapshot ids are `snap_` plus base64url; anything else is prose, not a marker. */
const MARKER_PATTERN = /\[\[cite:([A-Za-z0-9_-]+)(?:#([^\]]+))?\]\]/g;

/** Splits text so odd indices are whole citation markers and even indices are the text between. */
export function splitOnCitationMarkers(text: string): string[] {
  return text.split(/(\[\[cite:[A-Za-z0-9_-]+(?:#[^\]]+)?\]\])/g);
}

/** Private-use code point so placeholders never collide with draft text. */
const PLACEHOLDER = '\uE000';

export function citationMarker(snapshotId: string, locator?: string): string {
  return locator ? `[[cite:${snapshotId}#${locator}]]` : `[[cite:${snapshotId}]]`;
}

function toRef(snapshotId: string, locator: string | undefined): CitationRef {
  const trimmed = locator?.trim();
  return trimmed ? { snapshotId, locator: trimmed } : { snapshotId };
}

/** One sentence per match over marker-masked text: prose, then trailing marker runs. */
function sentenceSegments(): RegExp {
  /** Any sentence character, including a full stop inside a number such as `76.2`. */
  const body = `(?:[^\\n.!?${PLACEHOLDER}]|\\.(?=\\d))`;
  return new RegExp(
    `${body}*(?:${PLACEHOLDER}+${body}*)*` + `(?:[.!?]+["')\\]]*)?(?:[ \\t]*${PLACEHOLDER}+)*`,
    'g',
  );
}

/** Markdown that may open a sentence's line: blockquote, bullet, heading or `1.` marker. */
const LEADING_MARKUP = /^[\s>*+#-]*(?:\d+[.)][ \t]+)?/;

/**
 * Splits a markdown draft into sentences and returns those carrying at least one
 * citation. Markers are swapped for same-length placeholders before segmentation so
 * a locator such as `section 4.2.1` cannot split a sentence, and offsets stay exact.
 */
export function parseCitedSentences(draft: string): CitedSentence[] {
  const refs: CitationRef[] = [];
  const masked = draft.replace(MARKER_PATTERN, (match, id: string, locator?: string) => {
    refs.push(toRef(id, locator));
    return PLACEHOLDER.repeat(match.length);
  });

  const markerRun = new RegExp(`${PLACEHOLDER}+`, 'g');
  const sentencePattern = sentenceSegments();

  const sentences: CitedSentence[] = [];
  let refIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = sentencePattern.exec(masked)) !== null) {
    if (match[0].length === 0) {
      sentencePattern.lastIndex += 1;
      continue;
    }
    const segment = match[0];
    const runs = segment.match(markerRun) ?? [];
    if (runs.length === 0) {
      continue;
    }
    const citations: CitationRef[] = [];
    for (const run of runs) {
      let remaining = run.length;
      while (remaining > 0 && refIndex < refs.length) {
        const ref = refs[refIndex];
        remaining -= citationMarker(ref.snapshotId, ref.locator).length;
        citations.push(ref);
        refIndex += 1;
      }
    }
    const leading = segment.match(LEADING_MARKUP)?.[0].length ?? 0;
    const start = match.index + leading;
    const end = match.index + segment.trimEnd().length;
    const text = normaliseSentence(segment.replace(markerRun, ''));
    if (text.length > 0) {
      sentences.push({ text, citations, start, end });
    }
  }
  return sentences;
}

/** The note `ensureRequiredSections` writes under a section the draft left out. */
export const MISSING_SECTION_NOTE = 'The draft did not include this section.';

const MIN_PROSE_WORDS = 4;

/**
 * Counts prose sentences that carry no citation, so the summary can say when a report
 * states things without a source. Headings, table rows, short fragments and the
 * missing-section note are not prose. Uses the same segmentation as
 * `parseCitedSentences`.
 */
export function countUncitedSentences(draft: string): number {
  const masked = draft.replace(MARKER_PATTERN, (match) => PLACEHOLDER.repeat(match.length));
  const sentencePattern = sentenceSegments();
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = sentencePattern.exec(masked)) !== null) {
    if (match[0].length === 0) {
      sentencePattern.lastIndex += 1;
      continue;
    }
    if (match[0].includes(PLACEHOLDER)) {
      continue;
    }
    const lineStart = masked.lastIndexOf('\n', match.index - 1) + 1;
    const line = masked.slice(lineStart).trimStart();
    if (line.startsWith('#') || line.startsWith('|')) {
      continue;
    }
    const text = normaliseSentence(match[0]);
    if (
      text === MISSING_SECTION_NOTE ||
      !/[A-Za-z]/.test(text) ||
      text.split(' ').length < MIN_PROSE_WORDS
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}

function normaliseSentence(raw: string): string {
  const collapsed = raw
    .replace(/^[\s>*\-+#\d.)]*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.replace(/\s+([.!?])$/, '$1');
}

/**
 * Replaces every marker with `[n]`, numbering snapshots in first-seen order.
 * `order[n - 1]` is the snapshot id behind reference `n`.
 */
export function renderCitationMarkers(text: string): { text: string; order: string[] } {
  const order: string[] = [];
  const rendered = text.replace(MARKER_PATTERN, (_match, id: string) => {
    let index = order.indexOf(id);
    if (index === -1) {
      order.push(id);
      index = order.length - 1;
    }
    return `[${index + 1}]`;
  });
  return { text: rendered, order };
}
