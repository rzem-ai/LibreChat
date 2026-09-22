import type { MCPSourcesResult } from 'librechat-data-provider';

import { stripHtmlTags, htmlToMarkdownText, formatDisplayDate } from '../format';
import { buildListSources } from '../listSources';

/** Upper bound on results extracted from a single KX query response. */
const MAX_KX_RESULTS = 30;

interface KxResult {
  title?: string;
  description?: string;
  appurl?: string;
  source?: string;
  usageguidelines?: string;
  /** Deloitte Custom Change: per the KX API docs, content's date, e.g. KXQ_ProjectEndDate for Quals, KXA_ContentDate for Documents. */
  sortbydate?: string;
}

/** KX result-type identifier for a Deloitte Professional Network people-profile hit. */
const DPN_SOURCE_TYPE = 'DPN';

/** Fixed terms-of-use page linked from a DPN citation's usage-restriction notice and end-of-response disclaimer, in place of the profile URL itself. */
export const DPN_USAGE_GUIDELINES_URL = 'https://people.deloitte/legalcontent#termsofuse';

interface KxPayload {
  actualresults?: KxResult[];
  usage_guidelines?: string;
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
      return {
        toolName,
        serverName,
        title: result.title,
        link: result.appurl,
        content: [result.title, cleanDescription, usageWarning].filter(Boolean).join('\n\n'),
        usageRestriction: Boolean(result.usageguidelines) || isDpnResult,
        date: formatDisplayDate(result.sortbydate), // Deloitte Custom Change: citation date
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
