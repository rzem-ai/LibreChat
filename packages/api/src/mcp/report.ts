import type { MCPResultSource } from 'librechat-data-provider';

interface ReportSectionBody {
  PlainText?: string;
}

interface ReportSection {
  RequestedSection?: string;
  StatusCode?: number;
  Body?: Record<string, ReportSectionBody | undefined>;
}

interface ReportPayload {
  Sections?: ReportSection[];
}

/** "ExecutiveSummaryAnalysis" -> "Executive Summary Analysis" */
function humanizeSectionTitle(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
}

/**
 * Parses a `{ Sections: [{ RequestedSection, StatusCode, Body }] }` report
 * payload — the shape returned by tools like IBISWorld's
 * `ibisworld_report_sections` — into one {@link MCPResultSource} per section,
 * so each citation can point at a single section instead of the whole raw
 * JSON blob. Returns undefined (letting the caller fall back) when the
 * content isn't this report shape, or no section yields usable text.
 */
export function buildReportSources({
  toolName,
  serverName,
  content,
}: {
  toolName: string;
  serverName: string;
  content: string;
}): MCPResultSource[] | undefined {
  let parsed: ReportPayload;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (!parsed || !Array.isArray(parsed.Sections)) {
    return undefined;
  }

  const sources: MCPResultSource[] = [];
  for (const section of parsed.Sections) {
    if (section.StatusCode !== 200 || !section.Body) {
      continue;
    }
    const [bodyKey] = Object.keys(section.Body);
    const plainText = bodyKey ? section.Body[bodyKey]?.PlainText : undefined;
    if (!plainText) {
      continue;
    }
    const title = humanizeSectionTitle(bodyKey);
    sources.push({
      toolName,
      serverName,
      title,
      content: [title, plainText].filter(Boolean).join('\n\n'),
    });
  }

  return sources.length > 0 ? sources : undefined;
}
