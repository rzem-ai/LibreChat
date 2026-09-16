import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';
import { resolveMCPSourceLink } from './linkTemplates';

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

/** Upper bound on sources built from a single report-list payload. */
const MAX_REPORT_LIST_ITEMS = 30;

/** Upper bound on per-section sources built from a single report's `Sections` array. */
const MAX_REPORT_SECTION_ITEMS = 30;

/**
 * Deloitte Custom Change
 * Normalizes a raw `code`/`country` pair (from either a report-list entry's own
 * `Code`/`Country` fields or the tool call's `args`) into the shape
 * {@link resolveMCPSourceLink} expects — `country` lowercased, everything else
 * left `undefined` if it isn't a usable string/number. Shared by
 * {@link buildReportListSources} and {@link buildReportSources} so both sites
 * agree on what counts as a valid code/country.
 */
function normalizeCode(code: unknown): string | number | undefined {
  if (typeof code === 'string') {
    const trimmed = code.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return typeof code === 'number' && Number.isFinite(code) ? code : undefined;
}

function normalizeCodeAndCountry(
  code: unknown,
  country: unknown,
): { code: string | number | undefined; country: string | undefined } {
  const trimmedCountry = typeof country === 'string' ? country.trim() : undefined;
  return {
    code: normalizeCode(code),
    country: trimmedCountry ? trimmedCountry.toLowerCase() : undefined,
  };
}

/** "ExecutiveSummaryAnalysis" -> "Executive Summary Analysis" */
function humanizeSectionTitle(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
}

/**
 * Deloitte Custom Change
 * Finds the report's own title (e.g. "Finance in Australia") from a `Title`
 * section in the same payload, so every other section's citation can be
 * labeled `<report title>: <section title>` instead of just the section
 * name — otherwise two citations to, say, "Outlook Analysis" from two
 * different reports are visually indistinguishable.
 */
function extractReportTitle(
  sections: ReportSection[],
  usesBodyWrapper: boolean,
): string | undefined {
  for (const section of sections) {
    if (!section || typeof section !== 'object') {
      continue;
    }
    const body: unknown = usesBodyWrapper
      ? section.Body?.Title
      : (section as Record<string, unknown>).Title;
    if (typeof body === 'string') {
      const trimmed = body.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

/** Prefixes `sectionTitle` with the report's own title, when one was found (see {@link extractReportTitle}). */
function prefixSectionTitle(sectionTitle: string, reportTitle: string | undefined): string {
  return reportTitle ? `${reportTitle}: ${sectionTitle}` : sectionTitle;
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
function formatSectionBody(bodyKey: string, body: unknown): string | undefined {
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
  return formatGenericBody(body);
}

/**
 * Deloitte Custom Change
 * Generic fallback for section bodies that don't match one of
 * {@link formatSectionBody}'s specifically-handled shapes — covers
 * `ibisworld_full_report`'s scalar sections (`Code`, `Title`, `Author`, ...),
 * object sections (`Definition`, `Caption`, ...), and array-of-object
 * sections (`RelatedIndustries`, `Companies`, ...), as well as the existing
 * `{ PlainText }` shape used by `ibisworld_report_sections`.
 */
/** Formats a single element of a generic array-shaped section body (see {@link formatGenericBody}). */
function formatGenericArrayItem(item: unknown): string | undefined {
  if (item && typeof item === 'object') {
    return formatReportListItem(item as ReportListItem);
  }
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return String(item);
  }
  return undefined;
}

function formatGenericBody(body: unknown): string | undefined {
  if (typeof body === 'string') {
    return body;
  }
  if (typeof body === 'number' || typeof body === 'boolean') {
    return String(body);
  }
  if (Array.isArray(body)) {
    const lines = body.map(formatGenericArrayItem).filter((line): line is string => Boolean(line));
    return lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : undefined;
  }
  if (body && typeof body === 'object') {
    if (typeof (body as PlainTextBody).PlainText === 'string') {
      return (body as PlainTextBody).PlainText;
    }
    return formatReportListItem(body as ReportListItem);
  }
  return undefined;
}

/** Deloitte Custom Change: a single loosely-typed report-list entry (e.g. `{ Code, Title, Country }` for `ibisworld_list_reports`) — field names aren't pinned down beyond a handful of known keys, so any string/number/boolean leaf value is accepted. */
type ReportListItem = Record<string, string | number | boolean | null | undefined>;

/**
 * Deloitte Custom Change
 * Formats one report-list entry (e.g. `{ Code, Title, Country, ... }` as
 * returned by `ibisworld_list_reports`) into a single readable line, without
 * assuming exact field names beyond "some string/number leaf fields exist" —
 * the tool's per-field schema isn't otherwise pinned down in this codebase.
 */
function formatReportListItem(item: ReportListItem): string | undefined {
  const parts = Object.entries(item)
    .filter(
      ([, value]) =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    )
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Falls back to a `Report {code}` title when a report-list entry has no `Title` field. */
function resolveReportListItemTitle(
  title: unknown,
  code: string | number | undefined,
): string | undefined {
  if (typeof title === 'string') {
    const trimmed = title.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return code != null ? `Report ${code}` : undefined;
}

/**
 * Deloitte Custom Change
 * Builds one {@link MCPResultSource} per report-list entry (the shape
 * returned by `ibisworld_list_reports`), rather than requiring the
 * `Sections` shape used by per-section report tools — mirrors
 * {@link buildEntitySources}'s one-source-per-item pattern. Capped at
 * {@link MAX_REPORT_LIST_ITEMS} entries. Populates `link` once a matching
 * `ibisworld_` template is registered in {@link resolveMCPSourceLink}'s
 * registry, using this shape's own `Code`/`Country` fields — no extra
 * plumbing needed, unlike per-section reports which don't carry either
 * field in their response body.
 */
function buildReportListSources(
  toolName: string,
  serverName: string,
  items: ReportListItem[],
): MCPResultSource[] {
  const sources: MCPResultSource[] = [];
  for (const item of items.slice(0, MAX_REPORT_LIST_ITEMS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const content = formatReportListItem(item);
    if (!content) {
      continue;
    }
    const { code, country } = normalizeCodeAndCountry(item.Code, item.Country);
    const title = resolveReportListItemTitle(item.Title, code);
    if (!title) {
      continue;
    }
    sources.push({
      toolName,
      serverName,
      title,
      link: resolveMCPSourceLink(toolName, { code, country }),
      content: [title, content].join('\n\n'),
    });
  }
  return sources;
}

/**
 * Deloitte Custom Change
 * Parses a `{ Sections: [{ RequestedSection, StatusCode, Body }] }` report
 * payload — the shape returned by tools like IBISWorld's
 * `ibisworld_report_sections` — into one {@link MCPResultSource} per section,
 * so each citation can point at a single section instead of the whole raw
 * JSON blob. Also handles a top-level array payload from an `ibisworld_`
 * tool (e.g. `ibisworld_list_reports`) via {@link buildReportListSources} —
 * gated on the tool-name prefix so an unrelated tool that happens to return
 * a bare array isn't misclassified as a report list. A
 * section is skipped only for an error status (>= 400) or missing usable
 * content — any other status (200, 206, or absent) with a real `Body` is
 * cited. Returns undefined (letting the caller fall back) when the content
 * isn't a recognizable report shape, or nothing yields usable text.
 */
export function buildReportSources({
  toolName,
  serverName,
  content,
  args,
}: {
  toolName: string;
  serverName: string;
  content: string;
  args?: Record<string, unknown>;
}): MCPSourcesResult | undefined {
  let parsed: ReportPayload | ReportListItem[];
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (toolName.startsWith('ibisworld_') && Array.isArray(parsed)) {
    const sources = buildReportListSources(toolName, serverName, parsed);
    return sources.length > 0 ? { sources } : undefined;
  }

  if (!parsed || Array.isArray(parsed) || !Array.isArray(parsed.Sections)) {
    return undefined;
  }

  const { code, country } = normalizeCodeAndCountry(args?.code, args?.country);
  const link = resolveMCPSourceLink(toolName, { code, country });

  const usesBodyWrapper = parsed.Sections.some(
    (section) => section && typeof section === 'object' && 'Body' in section,
  );
  const reportTitle = extractReportTitle(parsed.Sections, usesBodyWrapper);

  const sources: MCPResultSource[] = [];
  for (const section of parsed.Sections) {
    if (sources.length >= MAX_REPORT_SECTION_ITEMS) {
      break;
    }
    if (!section || typeof section !== 'object') {
      continue;
    }
    let bodyKey: string | undefined;
    let body: unknown;
    if (usesBodyWrapper) {
      const isErrorStatus = typeof section.StatusCode === 'number' && section.StatusCode >= 400;
      if (isErrorStatus || !section.Body) {
        continue;
      }
      [bodyKey] = Object.keys(section.Body);
      body = bodyKey ? section.Body[bodyKey] : undefined;
    } else {
      [bodyKey] = Object.keys(section);
      body = bodyKey ? (section as Record<string, unknown>)[bodyKey] : undefined;
    }
    const formatted =
      bodyKey && body !== null && body !== undefined ? formatSectionBody(bodyKey, body) : undefined;
    if (!bodyKey || !formatted) {
      continue;
    }
    const sectionTitle = humanizeSectionTitle(bodyKey);
    const isTitleSection = bodyKey === 'Title';
    const title = isTitleSection ? formatted : prefixSectionTitle(sectionTitle, reportTitle);
    sources.push({
      toolName,
      serverName,
      title,
      link,
      content: isTitleSection ? formatted : [title, formatted].filter(Boolean).join('\n\n'),
    });
  }

  return sources.length > 0 ? { sources } : undefined;
}
