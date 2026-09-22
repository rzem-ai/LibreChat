import type { MCPSourcesResult } from 'librechat-data-provider';
import { formatDisplayDate } from '../format';
import { buildListSources } from '../listSources';

/** Upper bound on results extracted from a single AFR search response. */
const MAX_AFR_SEARCH_RESULTS = 30;

interface AfrSearchResult {
  title?: string;
  snippet?: string;
  view_url?: string;
  /** Deloitte Custom Change: AFR's published-date field, e.g. "09 June 2026, 08:41AM". */
  published?: string;
}

interface AfrSearchPayload {
  results?: AfrSearchResult[];
}

const AFR_PUBLISHED_DATE_PATTERN =
  /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})(AM|PM)$/i;

/**
 * Deloitte Custom Change: formats AFR's `published` field (e.g. "09 June 2026, 08:41AM") for
 * display; omits it if unparseable. `Date` cannot parse this shape directly, so the components
 * are pulled apart with a regex first.
 */
function formatAfrPublishedDate(published?: string): string | undefined {
  if (!published) {
    return undefined;
  }
  const match = published.trim().match(AFR_PUBLISHED_DATE_PATTERN);
  if (!match) {
    return undefined;
  }
  const [, day, monthName, year, hour, minute, meridiem] = match;
  // Deloitte Custom Change: `Date` natively understands full English month names, so this sidesteps hardcoding them.
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
  if (Number.isNaN(monthIndex)) {
    return undefined;
  }
  let hour24 = parseInt(hour, 10);
  const minuteValue = parseInt(minute, 10);
  if (hour24 < 1 || hour24 > 12 || minuteValue > 59) {
    return undefined;
  }
  if (meridiem.toUpperCase() === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (meridiem.toUpperCase() === 'AM' && hour24 === 12) {
    hour24 = 0;
  }
  const parsed = new Date(
    Date.UTC(parseInt(year, 10), monthIndex, parseInt(day, 10), hour24, minuteValue),
  );
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== parseInt(year, 10) ||
    parsed.getUTCMonth() !== monthIndex ||
    parsed.getUTCDate() !== parseInt(day, 10)
  ) {
    return undefined;
  }
  return formatDisplayDate(parsed.toISOString());
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

  const sources = buildListSources({
    items: parsed.results,
    maxItems: MAX_AFR_SEARCH_RESULTS,
    mapItem: (result) => {
      if (!result.title) {
        return undefined;
      }
      return {
        toolName,
        serverName,
        title: result.title,
        link: result.view_url,
        content: [result.title, result.snippet].filter(Boolean).join('\n\n'),
        date: formatAfrPublishedDate(result.published), // Deloitte Custom Change: citation date
      };
    },
  });

  return sources.length > 0 ? { sources } : undefined;
}
