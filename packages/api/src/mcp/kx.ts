import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';

import { stripHtmlTags } from './html';

/** Upper bound on results extracted from a single KX query response. */
const MAX_KX_RESULTS = 30;

interface KxResult {
  title?: string;
  description?: string;
  appurl?: string;
  usageguidelines?: string;
}

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
 * the model to repeat it. Returns undefined (letting the caller fall back)
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

  const sources: MCPResultSource[] = [];
  for (const result of parsed.actualresults.slice(0, MAX_KX_RESULTS)) {
    if (!result.title) {
      continue;
    }
    const cleanDescription = result.description ? stripHtmlTags(result.description) : undefined;
    const usageWarning = result.usageguidelines
      ? `Usage restrictions: ${result.usageguidelines}`
      : undefined;
    sources.push({
      toolName,
      serverName,
      title: result.title,
      link: result.appurl,
      content: [result.title, cleanDescription, usageWarning].filter(Boolean).join('\n\n'),
    });
  }

  if (sources.length === 0) {
    return undefined;
  }

  const disclaimer = parsed.usage_guidelines ? parsed.usage_guidelines : undefined;
  return disclaimer ? { sources, disclaimer } : { sources };
}
