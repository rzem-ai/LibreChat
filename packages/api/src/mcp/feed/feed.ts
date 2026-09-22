import { XMLParser } from 'fast-xml-parser';
import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';
import { buildSharePointSources } from '../sharepoint/sharepoint';
import { buildEntitySources } from '../entities/entities';
import { buildAfrSearchSources } from '../afr/afr';
import { buildReportSources } from '../report';
import { stripHtmlTags, formatDisplayDate } from '../format';
import { buildKxSources } from '../kx/kx';

/** Upper bound on articles extracted from a single feed (feeds are already newest-first). */
const MAX_FEED_ITEMS = 30;

const FEED_ROOT_PATTERN = /^\s*(<\?xml[^>]*\?>\s*)?<(rss|feed)[\s>]/i;

/**
 * Tool name prefixes with a dedicated shape-detector above. For these, an
 * unparsable or empty result (e.g. a REST error payload) yields no citation
 * at all rather than a raw-JSON-dump chip with no useful title or link.
 */
const KNOWN_MCP_TOOLSET_PREFIXES = ['afr_', 'ibisworld_', 'desc_', 'gims_', 'kx_', 'sp_'];

const SHAREPOINT_TOOL_PREFIX = 'sp_';

function isKnownMcpToolset(toolName: string): boolean {
  return KNOWN_MCP_TOOLSET_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

type XMLValue = string | number | boolean | XMLNode | XMLValue[];
type XMLNode = { [key: string]: XMLValue | undefined };

function toText(value: XMLValue | undefined): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return toText(value[0]);
  }
  if (typeof value === 'object' && '#text' in value) {
    return toText(value['#text']);
  }
  return '';
}

function asArray(value: XMLValue | undefined): XMLNode[] {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is XMLNode => typeof item === 'object' && item !== null);
  }
  if (typeof value === 'object') {
    return [value];
  }
  return [];
}

function extractRssLink(item: XMLNode): string {
  return toText(item.link);
}

function extractAtomLink(item: XMLNode): string {
  const links = asArray(item.link);
  if (links.length === 0) {
    return toText(item.link);
  }
  const alternate = links.find((link) => toText(link['@_rel']) === 'alternate' || !link['@_rel']);
  const href = (alternate ?? links[0])['@_href'];
  return toText(href);
}

function buildSourceFromItem(
  toolName: string,
  serverName: string,
  title: string,
  link: string,
  description: string,
  date?: string, // Deloitte Custom Change: citation date
): MCPResultSource | undefined {
  if (!title && !link) {
    return undefined;
  }
  const cleanDescription = stripHtmlTags(description);
  return {
    toolName,
    serverName,
    title,
    link,
    content: [title, cleanDescription].filter(Boolean).join('\n\n'),
    date,
  };
}

function parseRssItems(toolName: string, serverName: string, channel: XMLNode): MCPResultSource[] {
  const items = asArray(channel.item).slice(0, MAX_FEED_ITEMS);
  const sources: MCPResultSource[] = [];
  for (const item of items) {
    const source = buildSourceFromItem(
      toolName,
      serverName,
      toText(item.title),
      extractRssLink(item),
      toText(item.description ?? item['content:encoded']),
      formatDisplayDate(toText(item.pubDate)) ?? formatDisplayDate(toText(item.updated)),
    );
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

function parseAtomEntries(toolName: string, serverName: string, feed: XMLNode): MCPResultSource[] {
  const entries = asArray(feed.entry).slice(0, MAX_FEED_ITEMS);
  const sources: MCPResultSource[] = [];
  for (const entry of entries) {
    const source = buildSourceFromItem(
      toolName,
      serverName,
      toText(entry.title),
      extractAtomLink(entry),
      toText(entry.summary ?? entry.content),
      formatDisplayDate(toText(entry.published)) ?? formatDisplayDate(toText(entry.updated)),
    );
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

/**
 * Splits an MCP tool result into one {@link MCPResultSource} per article/section when
 * the content is a recognizable RSS/Atom feed or a `{ Sections: [...] }` report payload
 * (see {@link buildReportSources}), so each citation can point at the specific article
 * or section instead of the whole raw result. Falls back to today's single-source
 * behavior for anything else, or if parsing fails.
 */
export function buildMCPResultSources({
  toolName,
  serverName,
  content,
  args,
}: {
  toolName: string;
  serverName: string;
  content: string;
  /** Deloitte Custom Change: original tool call args, forwarded to {@link buildReportSources} for link resolution (e.g. `code`/`country`). */
  args?: Record<string, unknown>;
}): MCPSourcesResult {
  const fallback: MCPSourcesResult = {
    sources: isKnownMcpToolset(toolName) ? [] : [{ toolName, serverName, content }],
  };

  if (FEED_ROOT_PATTERN.test(content)) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      const parsed = parser.parse(content) as XMLNode;

      const rssChannel = asArray((parsed.rss as XMLNode | undefined)?.channel)[0];
      if (rssChannel) {
        const sources = parseRssItems(toolName, serverName, rssChannel);
        return sources.length > 0 ? { sources } : fallback;
      }

      const atomFeed = parsed.feed as XMLNode | undefined;
      if (atomFeed) {
        const sources = parseAtomEntries(toolName, serverName, atomFeed);
        return sources.length > 0 ? { sources } : fallback;
      }

      return fallback;
    } catch {
      return fallback;
    }
  }

  const reportSources = buildReportSources({ toolName, serverName, content, args });
  if (reportSources) {
    return reportSources;
  }

  const afrSearchSources = buildAfrSearchSources({ toolName, serverName, content });
  if (afrSearchSources) {
    return afrSearchSources;
  }

  const kxSources = buildKxSources({ toolName, serverName, content });
  if (kxSources) {
    return kxSources;
  }

  const entitySources = buildEntitySources({ toolName, serverName, content });
  if (entitySources) {
    return entitySources;
  }

  const sharePointSources = toolName.startsWith(SHAREPOINT_TOOL_PREFIX)
    ? buildSharePointSources({ toolName, serverName, content })
    : undefined;
  return sharePointSources ?? fallback;
}
