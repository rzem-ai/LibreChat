import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';

/** Upper bound on results extracted from a single SharePoint response. */
const MAX_SHAREPOINT_ITEMS = 100;

/** Keys under which `sp_list_*` tools wrap their result array (see `formatGraphListResponse`/`formatItemListResponse` in the gateway). */
const LIST_WRAPPER_KEYS = ['items', 'sites', 'drives', 'recentFiles', 'sharedFiles'] as const;

interface SharePointEntity {
  name?: string;
  displayName?: string;
  webUrl?: string;
  description?: string;
  parentPath?: string;
  /** Full file content (e.g. markdown/text extracted by `sp_read_file`), if present. */
  content?: string;
}

interface SharePointSearchHit {
  summary?: string;
  resource?: SharePointEntity;
}

interface SharePointPayload extends SharePointEntity {
  results?: SharePointSearchHit[];
  items?: SharePointEntity[];
  sites?: SharePointEntity[];
  drives?: SharePointEntity[];
  recentFiles?: SharePointEntity[];
  sharedFiles?: SharePointEntity[];
}

function buildEntitySource(
  toolName: string,
  serverName: string,
  entity: SharePointEntity,
  snippet?: string,
): MCPResultSource | undefined {
  const title = entity.name ?? entity.displayName;
  if (!title) {
    return undefined;
  }
  const detail = entity.content ?? snippet ?? entity.description ?? entity.parentPath;
  return {
    toolName,
    serverName,
    title,
    link: entity.webUrl,
    content: [title, detail].filter(Boolean).join('\n\n'),
  };
}

function buildSourcesFromEntities(
  toolName: string,
  serverName: string,
  entities: SharePointEntity[],
): MCPResultSource[] {
  const sources: MCPResultSource[] = [];
  for (const entity of entities.slice(0, MAX_SHAREPOINT_ITEMS)) {
    const source = buildEntitySource(toolName, serverName, entity);
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

/**
 * Scans `content` for the first `{...}` substring whose braces balance,
 * treating characters inside JSON string literals (respecting `\"` escapes)
 * as inert. Used to salvage the JSON envelope out of tool output that wraps
 * it in extra prose, e.g. `sp_read_file` prepending a plain-text notice
 * ("I was unable to read the file as text... converting to markdown") before
 * its `{ name, webUrl, content }` object. Returns undefined if no balanced
 * object is found.
 */
function extractFirstJsonObject(content: string): string | undefined {
  const start = content.indexOf('{');
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < content.length; i++) {
    const char = content[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === '\\') {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

/** Parses `content` as JSON, salvaging a balanced `{...}` substring when the whole string isn't valid JSON on its own. */
function parseJsonLoosely(content: string): SharePointPayload | undefined {
  try {
    return JSON.parse(content);
  } catch {
    // fall through to salvage a JSON object embedded in surrounding prose
  }

  const jsonSubstring = extractFirstJsonObject(content);
  if (!jsonSubstring) {
    return undefined;
  }
  try {
    return JSON.parse(jsonSubstring);
  } catch {
    return undefined;
  }
}

/**
 * Parses the SharePoint/Graph gateway payload shapes (`sp_search`'s
 * `{ results: [{ summary, resource }] }`, the `sp_list_*` tools' labeled list
 * wrappers `{ items | sites | drives | recentFiles | sharedFiles: [...] }`,
 * `sp_get_site`/`sp_get_item`'s bare Graph object, and `sp_read_file`'s
 * `{ name, webUrl, content }` object where `content` is the file's full
 * extracted text/markdown) into one {@link MCPResultSource} per
 * site/drive/file, so each citation can point at the specific document
 * instead of the whole raw JSON blob. Tolerates extra prose surrounding the
 * JSON object (see {@link extractFirstJsonObject}). Returns undefined
 * (letting the caller fall back) when no JSON object can be salvaged, or no
 * entry yields usable text.
 */
export function buildSharePointSources({
  toolName,
  serverName,
  content,
}: {
  toolName: string;
  serverName: string;
  content: string;
}): MCPSourcesResult | undefined {
  const parsed = parseJsonLoosely(content);
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }

  if (Array.isArray(parsed.results)) {
    const sources: MCPResultSource[] = [];
    for (const hit of parsed.results.slice(0, MAX_SHAREPOINT_ITEMS)) {
      const source = buildEntitySource(toolName, serverName, hit.resource ?? {}, hit.summary);
      if (source) {
        sources.push(source);
      }
    }
    return sources.length > 0 ? { sources } : undefined;
  }

  for (const key of LIST_WRAPPER_KEYS) {
    const list = parsed[key];
    if (Array.isArray(list)) {
      const sources = buildSourcesFromEntities(toolName, serverName, list);
      return sources.length > 0 ? { sources } : undefined;
    }
  }

  if (parsed.name || parsed.displayName) {
    const source = buildEntitySource(toolName, serverName, parsed);
    return source ? { sources: [source] } : undefined;
  }

  return undefined;
}
