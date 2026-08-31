import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';

/** Upper bound on results extracted from a single AFR search response. */
const MAX_AFR_SEARCH_RESULTS = 30;

interface AfrSearchResult {
  title?: string;
  snippet?: string;
  view_url?: string;
}

interface AfrSearchPayload {
  results?: AfrSearchResult[];
}

/**
 * Parses the AFR semantic-search payload shape
 * (`{ query, results: [{ title, snippet, view_url }] }`) returned by
 * `afr_search_news` — distinct from `afr_get_latest_news`'s RSS/Atom feed
 * shape — into one {@link MCPResultSource} per matched article. Returns
 * undefined (letting the caller fall back) when the content isn't this
 * shape, or no result yields usable text.
 */
export function buildAfrSearchSources({
  toolName,
  serverName,
  content,
}: {
  toolName: string;
  serverName: string;
  content: string;
}): MCPSourcesResult | undefined {
  let parsed: AfrSearchPayload;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (!parsed || !Array.isArray(parsed.results)) {
    return undefined;
  }

  const sources: MCPResultSource[] = [];
  for (const result of parsed.results.slice(0, MAX_AFR_SEARCH_RESULTS)) {
    if (!result.title) {
      continue;
    }
    sources.push({
      toolName,
      serverName,
      title: result.title,
      link: result.view_url,
      content: [result.title, result.snippet].filter(Boolean).join('\n\n'),
    });
  }

  return sources.length > 0 ? { sources } : undefined;
}
