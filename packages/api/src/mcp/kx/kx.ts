import type { MCPSourcesResult } from 'librechat-data-provider';

import { stripHtmlTags, htmlToMarkdownText, formatDisplayDate } from '../format';
import { buildListSources } from '../listSources';

/** Upper bound on results extracted from a single KX query response. */
const MAX_KX_RESULTS = 30;

interface KxResult {
  /** Deloitte Custom Change: IDs link citation records to KX's richer result records. */
  id?: string | number;
  _id?: string | number;
  title?: string;
  description?: string;
  appurl?: string;
  source?: string;
  usageguidelines?: string;
  /** Deloitte Custom Change: KX's detailed DPN result stores its profile update timestamp here. */
  modified?: string;
  /** KX-selected sort date; for qualifications this is KXQ_ProjectEndDate (the engagement end date). */
  sortbydate?: string;
  [key: string]: unknown;
}

/** KX result-type identifier for a Deloitte Professional Network people-profile hit. */
const DPN_SOURCE_TYPE = 'DPN';

/** Fixed terms-of-use page linked from a DPN citation's usage-restriction notice and end-of-response disclaimer, in place of the profile URL itself. */
export const DPN_USAGE_GUIDELINES_URL = 'https://people.deloitte/legalcontent#termsofuse';

interface KxPayload {
  actualresults?: KxResult[];
  /** Deloitte Custom Change: detailed records supply modified dates omitted from actualresults. */
  kxresults?: KxResult[];
  usage_guidelines?: string;
}

/**
 * Deloitte Custom Change: Formats a KX date and rejects its 1900 sentinel value.
 * @param value - Raw date-like value from a KX response.
 * @returns Formatted display date, or undefined when the value is invalid or a sentinel.
 */
function formatKxDateValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const date = formatDisplayDate(value);
  return date?.endsWith(' 1900') ? undefined : date;
}

/**
 * Deloitte Custom Change: Reads DPN update dates from the citation record and its matched detail.
 * @param result - DPN record used to create the citation.
 * @param relatedResult - Matching detailed KX record, when one is present.
 * @returns Formatted last-updated date, or undefined when neither record has a usable date.
 */
function findDpnLastUpdatedDate(result: KxResult, relatedResult?: KxResult): string | undefined {
  for (const candidate of [result, relatedResult]) {
    if (!candidate) {
      continue;
    }
    for (const [field, value] of Object.entries(candidate)) {
      const normalizedField = field.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isLastUpdatedField =
        (normalizedField.includes('last') &&
          (normalizedField.includes('update') || normalizedField.includes('modif'))) ||
        normalizedField === 'modified';
      if (!isLastUpdatedField) {
        continue;
      }
      const date = formatKxDateValue(value);
      if (date) {
        return date;
      }
    }
  }
  return undefined;
}

/**
 * Deloitte Custom Change: Selects the date and semantic label for a KX citation.
 * @param result - KX citation record.
 * @param relatedResult - Matching detailed KX record, when one is present.
 * @returns A formatted date with its label, or undefined when no date applies.
 */
function getKxDate(
  result: KxResult,
  relatedResult?: KxResult,
): { date?: string; dateLabel?: 'engagementEnd' | 'lastUpdated' } | undefined {
  if (result.source === DPN_SOURCE_TYPE) {
    return { date: findDpnLastUpdatedDate(result, relatedResult), dateLabel: 'lastUpdated' };
  }
  if (result.appurl && /\/quals\/view\//i.test(result.appurl)) {
    return {
      date: formatKxDateValue(result.sortbydate),
      dateLabel: 'engagementEnd',
    };
  }
  const date = formatKxDateValue(result.sortbydate);
  return date ? { date } : undefined;
}

/**
 * Parses the Deloitte KX query payload shape
 * (`{ summary, actualresults: [{ title, description, appurl }] }`) into one
 * {@link MCPResultSource} per matched person/document, so each citation can
 * point at the specific profile instead of the whole raw JSON blob. Also
 * surfaces the payload's top-level `usage_guidelines` disclaimer, if any, so
 * it can be appended to the answer deterministically rather than relying on
 * the model to repeat it. KX embeds its own `<cit><a href="...">` markup in
 * that field, which is converted to markdown links (not stripped outright)
 * so the disclaimer stays clickable once appended to the markdown-rendered
 * answer. Each source that carries its own per-result `usageguidelines`, or
 * that is a DPN (Deloitte Professional Network) people-profile result, is
 * flagged with `usageRestriction: true` so the UI can show a distinct warning
 * on that citation chip. Returns undefined (letting the caller fall back)
 * when the content isn't this KX shape, or no result yields usable text.
 */
export function buildKxSources({
  toolName,
  serverName,
  content,
}: {
  toolName: string;
  serverName: string;
  content: string;
}): MCPSourcesResult | undefined {
  let parsed: KxPayload;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (!parsed || !Array.isArray(parsed.actualresults)) {
    return undefined;
  }

  // Deloitte Custom Change: index detailed KX results to recover DPN modified dates by record ID.
  const kxResultsById = new Map<string, KxResult>();
  for (const result of Array.isArray(parsed.kxresults) ? parsed.kxresults : []) {
    if (result.id !== undefined) {
      kxResultsById.set(String(result.id), result);
    }
  }

  let dpnUsageRestriction = false;
  const sources = buildListSources({
    items: parsed.actualresults,
    maxItems: MAX_KX_RESULTS,
    mapItem: (result) => {
      if (!result.title) {
        return undefined;
      }
      const isDpnResult = result.source === DPN_SOURCE_TYPE;
      dpnUsageRestriction = dpnUsageRestriction || isDpnResult;
      const cleanDescription = result.description ? stripHtmlTags(result.description) : undefined;
      const usageWarning = result.usageguidelines
        ? `Usage restrictions: ${stripHtmlTags(result.usageguidelines)}`
        : undefined;
      // Deloitte Custom Change: join the DPN citation record to its detailed modified-date record.
      const relatedResult =
        result._id === undefined ? undefined : kxResultsById.get(String(result._id));
      const date = getKxDate(result, relatedResult);
      return {
        toolName,
        serverName,
        title: result.title,
        link: result.appurl,
        content: [result.title, cleanDescription, usageWarning].filter(Boolean).join('\n\n'),
        usageRestriction: Boolean(result.usageguidelines) || isDpnResult,
        ...(date ?? {}),
        usageRestrictionLink: isDpnResult ? DPN_USAGE_GUIDELINES_URL : undefined,
      };
    },
  });

  if (sources.length === 0) {
    return undefined;
  }

  const disclaimer = parsed.usage_guidelines
    ? htmlToMarkdownText(parsed.usage_guidelines)
    : undefined;
  return {
    sources,
    ...(disclaimer ? { disclaimer } : {}),
    ...(dpnUsageRestriction ? { dpnUsageRestriction } : {}),
  };
}
