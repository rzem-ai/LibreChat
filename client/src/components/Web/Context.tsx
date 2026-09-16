import { createContext, useContext, useState, useCallback } from 'react';
import type { SearchRefType, ValidSource, ResultReference } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type * as t from './types';
import { useSearchContext } from '~/Providers';

export interface CitationContextType {
  hoveredCitationIds: Set<string> | null;
  setHoveredCitationIds: (ids: Array<string> | null) => void;
}

export const CitationContext = createContext<CitationContextType>({
  hoveredCitationIds: null,
  setHoveredCitationIds: () => {},
});

/**
 * Deloitte Custom Change: mounts the stateful hover-highlight provider shared by every
 * production render path that shows citation chips. Mounted once in `MultiMessage` for the
 * three chat-message row variants (`MessageParts`/`ContentParts`, `MessageContent`/
 * `ContentRender`, and the legacy `Message`/`MessageRender` path), and separately in
 * `SearchContent` for the Share/SearchMessage views, which sit outside that tree. A path
 * that renders `Citation`/`CompositeCitation` without this wrapper silently falls back to
 * `CitationContext`'s no-op default, so hover-highlighting would no-op there instead of
 * erroring.
 */
export function CitationHighlightProvider({ children }: { children: ReactNode }) {
  const [hoveredCitationIds, setHoveredCitationIdsState] = useState<Set<string> | null>(null);
  const setHoveredCitationIds = useCallback(
    (ids: Array<string> | null) =>
      setHoveredCitationIdsState(ids && ids.length > 0 ? new Set(ids) : null),
    [],
  );
  return (
    <CitationContext.Provider value={{ hoveredCitationIds, setHoveredCitationIds }}>
      {children}
    </CitationContext.Provider>
  );
}

/** Deloitte Custom Change: whether `citationId` is one of the currently hovered chip's ids. */
export function useHighlightState(citationId: string | undefined) {
  const { hoveredCitationIds } = useContext(CitationContext);
  return !!citationId && !!hoveredCitationIds?.has(citationId);
}

export type CitationSource = (ValidSource | ResultReference) & {
  turn: number;
  refType: string | SearchRefType;
  index: number;
};

const refTypeMap: Record<string | SearchRefType, string> = {
  search: 'organic',
  ref: 'references',
  news: 'topStories',
  file: 'references',
  mcp: 'mcp_results',
};

/** Deloitte Custom Change: maps a citation's `refType` to its `SearchResultData` array key. */
function resolveSearchResultsKey(refType: string): string {
  return refTypeMap[refType.toLowerCase()] ?? refType;
}

/** Deloitte Custom Change: fills the fields `t.Citation & t.Reference` requires but a raw source may omit. */
function normalizeCitationSource(
  source: CitationSource,
  turn: number,
  refType: string,
  index: number,
): t.Citation & t.Reference {
  return {
    ...source,
    turn,
    refType: refType.toLowerCase(),
    index,
    link: source.link ?? '',
    title: source.title ?? '',
    snippet: source['snippet'] ?? '',
    attribution: source.attribution ?? '',
  };
}

export function useCitation({
  turn,
  index,
  refType: _refType,
}: {
  turn: number;
  index: number;
  refType?: SearchRefType | string;
}): (t.Citation & t.Reference) | undefined {
  const { searchResults } = useSearchContext();
  if (!_refType) {
    return undefined;
  }
  const refType = resolveSearchResultsKey(_refType);

  if (!searchResults || !searchResults[turn] || !searchResults[turn][refType]) {
    return undefined;
  }

  const source: CitationSource = searchResults[turn][refType][index];

  if (!source) {
    return undefined;
  }

  return normalizeCitationSource(source, turn, _refType, index);
}

/**
 * Deloitte Custom Change: `useSearchResultsByTurn` synthesizes a `#mcp-{serverName}-{toolName}`
 * placeholder link for MCP sources that have no real link, so unrelated MCP results from the
 * same tool/server share this placeholder and must not be treated as the same source.
 */
function isSyntheticMCPLink(link?: string): boolean {
  return typeof link === 'string' && link.startsWith('#mcp-');
}

/**
 * Deloitte Custom Change: stable key for a composite citation source so multiple
 * refs resolving to the same underlying source (e.g. several report-section
 * citations that all share one report link) collapse into one entry. Falls back
 * to `fileId`/title/index when a source has no real link. A synthetic MCP
 * placeholder link never identifies a specific source, so it also skips the
 * `title` fallback (distinct MCP results can share a label) straight to the
 * per-instance `turn-refType-index` key.
 */
function getSourceDedupeKey(
  source: CitationSource,
  turn: number,
  refType: string,
  index: number,
): string {
  const hasSyntheticLink = isSyntheticMCPLink(source.link);
  const link = source.link && !hasSyntheticLink ? source.link : undefined;
  const fileId = 'fileId' in source ? source.fileId : undefined;
  if (link) {
    return link;
  }
  if (fileId) {
    return fileId;
  }
  if (!hasSyntheticLink && source.title) {
    return source.title;
  }
  return `${turn}-${refType}-${index}`;
}

export type CompositeCitationResult = t.Citation & t.Reference & { citationIds: Array<string> };

export function useCompositeCitations(
  citations: Array<t.Citation>,
): Array<CompositeCitationResult> {
  const { searchResults } = useSearchContext();

  const result: Array<CompositeCitationResult> = [];
  const seenAt = new Map<string, number>();

  for (const { turn, refType: _refType, index, citationId } of citations) {
    const refType = resolveSearchResultsKey(_refType);

    if (!searchResults || !searchResults[turn] || !searchResults[turn][refType]) {
      continue;
    }
    const source: CitationSource = searchResults[turn][refType][index];
    if (!source) {
      continue;
    }

    const dedupeKey = getSourceDedupeKey(source, turn, refType, index);
    const existingIndex = seenAt.get(dedupeKey);
    // Deloitte Custom Change: a duplicate source still owns a distinct highlighted-text span,
    // so its citationId must keep publishing on hover instead of being dropped with the duplicate.
    if (existingIndex !== undefined) {
      if (citationId) {
        result[existingIndex].citationIds.push(citationId);
      }
      continue;
    }
    seenAt.set(dedupeKey, result.length);

    result.push({
      ...normalizeCitationSource(source, turn, _refType, index),
      citationId,
      citationIds: citationId ? [citationId] : [],
    });
  }

  return result;
}
