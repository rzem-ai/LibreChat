import type { ICitationResult, ISnapshot, IVerificationSummary } from '../db';
import type { CitationState } from '../contract/types';
import type { CitedSentence } from './citations';
import { parseCitedSentences, countUncitedSentences } from './citations';

/** Judges a single claim against one passage; `true` means the passage alone supports it. */
export interface ClaimVerifier {
  verifyClaim(input: {
    claim: string;
    passage: string;
    strict: boolean;
    signal?: AbortSignal;
  }): Promise<boolean>;
  /** Returns a short note when the report diverges from its brief, otherwise null. */
  checkScope(input: {
    brief: string;
    report: string;
    signal?: AbortSignal;
  }): Promise<string | null>;
}

/** Re-opens a snapshot's stored markdown; null when the body is gone. */
export interface SnapshotReader {
  read(snapshot: ISnapshot, signal?: AbortSignal): Promise<string | null>;
}

export type VerificationOutcome = {
  sentences: CitedSentence[];
  /** One state per sentence, aligned with `sentences`. */
  sentenceStates: CitationState[];
  citations: ICitationResult[];
  summary: IVerificationSummary;
  /** Human-readable caveats about the pass itself (cap reached, verifier failures). */
  notes?: string;
  snapshots: ISnapshot[];
};

const DEFAULT_PASSAGE_CHARS = 6000;
const LOCATOR_LEAD_CHARS = 200;
const DEFAULT_CONCURRENCY = 8;

function keywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}%$.]+/u)
        .map((word) => word.replace(/^\.+|\.+$/g, ''))
        .filter((word) => word.length >= 4 || /\d/.test(word)),
    ),
  );
}

/**
 * Picks the part of a snapshot the verifier sees. A locator found in the content anchors
 * the window; otherwise paragraphs are ranked by keyword overlap with the claim and the
 * best ones are kept in their original order.
 */
export function locatePassage(
  content: string,
  claim: string,
  locator: string | undefined,
  maxChars: number = DEFAULT_PASSAGE_CHARS,
): string {
  if (locator) {
    const index = content.toLowerCase().indexOf(locator.toLowerCase());
    if (index !== -1) {
      const lead = Math.min(LOCATOR_LEAD_CHARS, Math.floor(maxChars / 10));
      const start = Math.max(0, index - lead);
      return content.slice(start, start + maxChars);
    }
  }
  if (content.length <= maxChars) {
    return content;
  }
  const words = keywords(claim);
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((text, order) => {
      const lower = text.toLowerCase();
      const score = words.reduce((total, word) => total + (lower.includes(word) ? 1 : 0), 0);
      return { text, order, score };
    })
    .filter((paragraph) => paragraph.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const kept: typeof paragraphs = [];
  let size = 0;
  for (const paragraph of paragraphs) {
    if (size + paragraph.text.length > maxChars && kept.length > 0) {
      continue;
    }
    kept.push(paragraph);
    size += paragraph.text.length + 2;
    if (size >= maxChars) {
      break;
    }
  }
  if (kept.length === 0) {
    return content.slice(0, maxChars);
  }
  return kept
    .sort((a, b) => a.order - b.order)
    .map((paragraph) => paragraph.text)
    .join('\n\n')
    .slice(0, maxChars);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function sentenceState(states: CitationState[], strict: boolean): CitationState {
  if (states.every((state) => state === 'unavailable')) {
    return 'unavailable';
  }
  const supported = strict
    ? states.every((state) => state === 'supported')
    : states.some((state) => state === 'supported');
  return supported ? 'supported' : 'unsupported';
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The deterministic verification pass (design 5.3 step 5). Every cited snapshot is
 * re-read from storage, the referenced passage located, and the claim judged against
 * that passage alone. Snapshots are loaded in one owner-scoped query.
 */
export async function verifyDraft(params: {
  draft: string;
  brief?: string;
  userId: string;
  maxClaims: number;
  strict: boolean;
  getSnapshotsByIds: (ids: string[], userId: string) => Promise<ISnapshot[]>;
  reader: SnapshotReader;
  verifier: ClaimVerifier;
  concurrency?: number;
  signal?: AbortSignal;
}): Promise<VerificationOutcome> {
  const { draft, brief, userId, maxClaims, strict, reader, verifier, signal } = params;
  const sentences = parseCitedSentences(draft);
  const flat = sentences.flatMap((sentence, sentenceIndex) =>
    sentence.citations.map((citation) => ({ sentenceIndex, sentence, citation })),
  );

  const ids = Array.from(new Set(flat.map((entry) => entry.citation.snapshotId)));
  const snapshots = await params.getSnapshotsByIds(ids, userId);
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const contentCache = new Map<string, Promise<string | null>>();
  const readContent = (snapshot: ISnapshot) => {
    let pending = contentCache.get(snapshot.id);
    if (!pending) {
      pending = reader.read(snapshot, signal).catch(() => null);
      contentCache.set(snapshot.id, pending);
    }
    return pending;
  };

  let unchecked = 0;
  let verifierFailures = 0;
  const states = await mapLimit(
    flat,
    params.concurrency ?? DEFAULT_CONCURRENCY,
    async (entry, index): Promise<CitationState> => {
      const snapshot = byId.get(entry.citation.snapshotId);
      if (!snapshot) {
        return 'unavailable';
      }
      if (index >= maxClaims) {
        unchecked += 1;
        return 'unsupported';
      }
      const content = await readContent(snapshot);
      if (content == null) {
        return 'unavailable';
      }
      const passage = locatePassage(content, entry.sentence.text, entry.citation.locator);
      try {
        const supported = await verifier.verifyClaim({
          claim: entry.sentence.text,
          passage,
          strict,
          signal,
        });
        return supported ? 'supported' : 'unsupported';
      } catch {
        verifierFailures += 1;
        return 'unsupported';
      }
    },
  );

  const citations: ICitationResult[] = flat.map((entry, index) => ({
    claim: entry.sentence.text,
    snapshotId: entry.citation.snapshotId,
    ...(entry.citation.locator ? { locator: entry.citation.locator } : {}),
    state: states[index],
  }));

  const perSentence: CitationState[][] = sentences.map(() => []);
  flat.forEach((entry, index) => perSentence[entry.sentenceIndex].push(states[index]));
  const sentenceStates = perSentence.map((list) => sentenceState(list, strict));

  const summary: IVerificationSummary = {
    supported: states.filter((state) => state === 'supported').length,
    unsupported: states.filter((state) => state === 'unsupported').length,
    unavailable: states.filter((state) => state === 'unavailable').length,
    total: states.length,
  };
  const uncited = countUncitedSentences(draft);
  if (uncited > 0) {
    summary.uncited = uncited;
  }

  if (brief) {
    try {
      const scopeNotes = await verifier.checkScope({ brief, report: draft, signal });
      if (scopeNotes) {
        summary.scopeNotes = scopeNotes;
      }
    } catch {
      verifierFailures += 1;
    }
  }

  const caveats: string[] = [];
  if (unchecked > 0) {
    caveats.push(
      `${plural(unchecked, 'citation')} ${unchecked === 1 ? 'was' : 'were'} not checked because the verification cap was reached; ${unchecked === 1 ? 'it is' : 'they are'} marked unverified.`,
    );
  }
  if (verifierFailures > 0) {
    caveats.push(
      `${plural(verifierFailures, 'check')} could not be checked because the verification model failed; affected claims are marked unverified.`,
    );
  }

  return {
    sentences,
    sentenceStates,
    citations,
    summary,
    ...(caveats.length > 0 ? { notes: caveats.join(' ') } : {}),
    snapshots,
  };
}
