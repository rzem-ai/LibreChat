import type { IResearchNote, ISnapshot, IVerificationSummary } from '../db';
import type { CitationState } from '../contract/types';
import {
  citationMarker,
  parseCitedSentences,
  renderCitationMarkers,
  splitOnCitationMarkers,
  MISSING_SECTION_NOTE,
} from './citations';
import { ResearchJobType } from '../contract/types';

const STATE_LABELS: Partial<Record<CitationState, string>> = {
  unsupported: '**[Unverified]** ',
  unavailable: '**[Source unavailable]** ',
};

const REFERENCES: Record<string, string> = {
  '[': '&#91;',
  ']': '&#93;',
  '<': '&lt;',
  '`': '&#96;',
  '\\': '&#92;',
  '~': '&#126;',
  $: '&#36;',
  '(': '&#40;',
  ':': '&#58;',
  '!': '&#33;',
};

/** Matches an `&` that CommonMark would decode as a character reference. */
const CHARACTER_REFERENCE = /&(?=(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});)/g;
/** Invisible and non-punctuation: splits the sequences GFM's autolink literals need. */
const WORD_JOINER = '\u2060';

/**
 * Neutralises untrusted text for LibreChat's markdown pipeline (GFM, directives for
 * artifacts, llm-math, unicode citations, MCP UI resources).
 *
 * - Characters that can open a link, image, reference, raw HTML, directive, code span,
 *   fence (backtick or tilde) or math (backslash or dollar) become HTML character
 *   references, wherever they appear, so no line or container context can re-arm them. CommonMark decodes them to literal text, and
 *   no micromark tokenizer treats a decoded character as syntax. Backslashes are encoded
 *   too, never emitted, because llm-math reads `\[` and `\(` as math delimiters.
 * - References the text already contains are re-encoded (`&` to `&amp;`), so a model cannot
 *   smuggle syntax in as `&colon;` or a private-use citation marker as `&#xE202;`.
 * - GFM autolink literals are found by a regex over decoded text, so encoding cannot stop
 *   them. A word joiner inside every `://`, and before every `www.` and `@`, breaks both
 *   GFM's autolink tokenizer and its decoded-text pass with no reliance on word
 *   boundaries, while the URL stays readable.
 * - Prose colons ("Note: ...", "10:30") stay readable; only a colon that could start a
 *   directive is encoded.
 *
 * Not idempotent (it encodes `&`): sanitise each piece of model text exactly once.
 */
export function escapeMarkdownInline(text: string): string {
  return text
    .replace(/[\uE000-\uF8FF\u2060]/g, '')
    .replace(CHARACTER_REFERENCE, '&amp;')
    .replace(/[[\]<`\\~$]/g, (char) => REFERENCES[char])
    .replace(/:(?=[:A-Za-z{])/g, REFERENCES[':'])
    .replace(/:\/\//g, `:${WORD_JOINER}//`)
    .replace(/www\./gi, (match) => `${WORD_JOINER}${match}`)
    .replace(/@/g, `${WORD_JOINER}@`);
}

/** Single-line, escaped rendering of untrusted text (titles, references, scope notes). */
function safeInline(text: string): string {
  return escapeMarkdownInline(text.replace(/\s+/g, ' ').trim());
}

function safeUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href.replace(/[()\s]/g, encodeURIComponent)
      : undefined;
  } catch {
    return undefined;
  }
}

function describeSource(snapshot: ISnapshot | undefined, id: string): string {
  if (!snapshot) {
    return `Source unavailable (snapshot ${safeInline(id)})`;
  }
  const title = safeInline(snapshot.title || snapshot.reference || id);
  const fetched = snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toISOString().slice(0, 10) : '';
  const url = safeUrl(snapshot.url);
  const head = url ? `[${title}](${url})` : `${title} - ${safeInline(snapshot.reference)}`;
  return `${head}${fetched ? `, fetched ${fetched}` : ''} (snapshot ${safeInline(id)})`;
}

function summaryLine(summary: IVerificationSummary): string {
  const uncited = summary.uncited
    ? ` ${summary.uncited} sentence${summary.uncited === 1 ? ' carries' : 's carry'} no citation.`
    : '';
  return (
    `> **Verification:** ${summary.supported} supported, ${summary.unsupported} unverified, ` +
    `${summary.unavailable} source unavailable (${summary.total} citation${summary.total === 1 ? '' : 's'}).` +
    uncited
  );
}

/**
 * Neutralises model output before verification and delivery. A fetched page can steer
 * the model, so nothing it writes may load or link to a URL when the report renders:
 * everything outside citation markers goes through `escapeMarkdownInline`, a `(` or `:`
 * directly after a marker is encoded so `[n]` can never become a link or definition,
 * and a `!` directly before one is encoded so it can never become an image reference.
 * Escaping rather than pattern-stripping leaves no parser differential to exploit.
 * Deterministic, so verification and the report segment the same sentences when both
 * sanitise the same raw draft. Not idempotent: never sanitise a sanitised draft.
 */
export function sanitiseDraft(draft: string): string {
  const parts = splitOnCitationMarkers(draft);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }
      let escaped = escapeMarkdownInline(part);
      if (index > 0) {
        escaped = escaped.replace(/^[(:]/, (char) => REFERENCES[char]);
      }
      if (index < parts.length - 1) {
        escaped = escaped.replace(/!$/, REFERENCES['!']);
      }
      return escaped;
    })
    .join('');
}

/**
 * Assembles the delivered markdown: title, verification summary, the draft with weak
 * claims labelled in place and markers rendered as `[n]`, scope notes, then sources.
 */
export function buildReport(params: {
  title: string;
  draft: string;
  sentenceStates: CitationState[];
  summary: IVerificationSummary;
  snapshots: ISnapshot[];
  partial: boolean;
  notes?: string;
}): string {
  const { sentenceStates, summary, partial } = params;
  const draft = sanitiseDraft(params.draft);
  const sentences = parseCitedSentences(draft);

  let annotated = draft;
  for (let index = sentences.length - 1; index >= 0; index--) {
    const label = STATE_LABELS[sentenceStates[index]];
    if (label) {
      const { start } = sentences[index];
      annotated = annotated.slice(0, start) + label + annotated.slice(start);
    }
  }

  const { text: body, order } = renderCitationMarkers(annotated);
  const byId = new Map(params.snapshots.map((snapshot) => [snapshot.id, snapshot]));

  const lines: string[] = [`# ${safeInline(params.title)}`, '', summaryLine(summary)];
  if (partial) {
    lines.push(
      '>',
      '> **Partial report:** the research budget ran out before the job finished, so this report covers only what was gathered in time.',
    );
  }
  lines.push('', body.trim());

  const scope = [summary.scopeNotes, params.notes].filter(Boolean) as string[];
  if (scope.length > 0) {
    lines.push('', '## Scope notes', '', ...scope.map((note) => safeInline(note)));
  }
  if (order.length > 0) {
    lines.push('', '## Sources', '');
    order.forEach((id, index) => lines.push(`${index + 1}. ${describeSource(byId.get(id), id)}`));
  }
  return `${lines.join('\n')}\n`;
}

/** Deterministic draft used when no model draft exists (budget or phase failure). */
export function buildFallbackDraft(notes: IResearchNote[]): string {
  if (notes.length === 0) {
    return 'No sources were gathered before the research budget ran out, so there are no findings to report.';
  }
  const items = notes.map(
    (note) => `- ${note.claim.trim()} ${citationMarker(note.snapshotId, note.locator)}`,
  );
  return ['## Findings', '', ...items].join('\n');
}

const REQUIRED_SECTIONS: Partial<Record<ResearchJobType, { heading: string; pattern: RegExp }>> = {
  [ResearchJobType.TRENDS]: {
    heading: '## What changed since the last report',
    pattern: /^#{1,6}[ \t]+what changed\b/im,
  },
  [ResearchJobType.DIGEST]: { heading: '## Left out', pattern: /^#{1,6}[ \t]+left out\b/im },
};

/**
 * Trends reports must say what changed and digests must say what they dropped (design
 * 5.7). A draft without the section gets the heading and a note saying so, so the gap is
 * visible in the report rather than silently missing.
 */
export function ensureRequiredSections(jobType: ResearchJobType, draft: string): string {
  const required = REQUIRED_SECTIONS[jobType];
  if (!required || required.pattern.test(draft)) {
    return draft;
  }
  return `${draft.trimEnd()}\n\n${required.heading}\n\n${MISSING_SECTION_NOTE}`;
}
