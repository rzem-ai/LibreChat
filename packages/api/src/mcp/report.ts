import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';

interface PlainTextBody {
  PlainText?: string;
}

interface SwotBody {
  Strengths?: string[];
  Weaknesses?: string[];
  Opportunities?: string[];
  Threats?: string[];
}

interface KeyStatisticYear {
  Year?: number;
  CurrentValue?: number;
}

interface KeyStatistic {
  Caption?: string;
  Unit?: string;
  Years?: KeyStatisticYear[];
}

interface OutlookAnalysisItem {
  Headline?: string;
  Analysis?: PlainTextBody[];
}

interface HighlightItem {
  Highlight?: string;
  Year?: number;
  Value?: number;
  Unit?: string;
}

type ReportSectionBody =
  | PlainTextBody
  | SwotBody
  | KeyStatistic[]
  | OutlookAnalysisItem[]
  | HighlightItem[];

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

function formatSwotBody(body: SwotBody): string | undefined {
  const groups: Array<[string, string[] | undefined]> = [
    ['Strengths', body.Strengths],
    ['Weaknesses', body.Weaknesses],
    ['Opportunities', body.Opportunities],
    ['Threats', body.Threats],
  ];
  const blocks = groups
    .filter((group): group is [string, string[]] => Array.isArray(group[1]) && group[1].length > 0)
    .map(([label, items]) => [`${label}:`, ...items.map((item) => `- ${item}`)].join('\n'));
  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}

function formatValueLine(
  caption: string,
  unit: string | undefined,
  year: number | undefined,
  value: number | undefined,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  const unitSuffix = unit ? ` ${unit}` : '';
  const yearSuffix = year != null ? ` (${year})` : '';
  return `${caption}: ${value}${unitSuffix}${yearSuffix}`;
}

function formatKeyStatisticsBody(body: KeyStatistic[]): string | undefined {
  const lines: string[] = [];
  for (const stat of body) {
    if (!stat.Caption || !Array.isArray(stat.Years) || stat.Years.length === 0) {
      continue;
    }
    const latest = stat.Years[stat.Years.length - 1];
    const line = formatValueLine(stat.Caption, stat.Unit, latest.Year, latest.CurrentValue);
    if (line) {
      lines.push(line);
    }
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

function formatHighlightsBody(body: HighlightItem[]): string | undefined {
  const lines: string[] = [];
  for (const highlight of body) {
    if (!highlight.Highlight) {
      continue;
    }
    const line = formatValueLine(
      highlight.Highlight,
      highlight.Unit,
      highlight.Year,
      highlight.Value,
    );
    if (line) {
      lines.push(line);
    }
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

function formatOutlookAnalysisBody(body: OutlookAnalysisItem[]): string | undefined {
  const blocks: string[] = [];
  for (const item of body) {
    const analysisText = (item.Analysis ?? [])
      .map((entry) => entry.PlainText)
      .filter((text): text is string => Boolean(text))
      .join('\n');
    if (!item.Headline && !analysisText) {
      continue;
    }
    blocks.push([item.Headline, analysisText].filter(Boolean).join('\n'));
  }
  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}

/**
 * Formats a section's body into plain text, dispatching on the body key
 * since IBISWorld reports use a different shape per section: prose sections
 * carry `{ PlainText }`, while `SWOT`, `KeyStatistics`, `OutlookAnalysis`, and
 * `Highlights` carry structured data with no `PlainText` field at all.
 */
function formatSectionBody(bodyKey: string, body: ReportSectionBody): string | undefined {
  if (bodyKey === 'SWOT') {
    return formatSwotBody(body as SwotBody);
  }
  if (bodyKey === 'KeyStatistics') {
    return formatKeyStatisticsBody(body as KeyStatistic[]);
  }
  if (bodyKey === 'OutlookAnalysis') {
    return formatOutlookAnalysisBody(body as OutlookAnalysisItem[]);
  }
  if (bodyKey === 'Highlights') {
    return formatHighlightsBody(body as HighlightItem[]);
  }
  return (body as PlainTextBody).PlainText;
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
}): MCPSourcesResult | undefined {
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
    const body = bodyKey ? section.Body[bodyKey] : undefined;
    const formatted = body ? formatSectionBody(bodyKey, body) : undefined;
    if (!formatted) {
      continue;
    }
    const title = humanizeSectionTitle(bodyKey);
    sources.push({
      toolName,
      serverName,
      title,
      content: [title, formatted].filter(Boolean).join('\n\n'),
    });
  }

  return sources.length > 0 ? { sources } : undefined;
}
