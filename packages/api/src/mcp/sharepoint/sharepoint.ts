import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';

/** Upper bound on results extracted from a single SharePoint response. */
const MAX_SHAREPOINT_ITEMS = 30;

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
 * Parses the SharePoint/Graph gateway payload shapes (`sp_search`'s
 * `{ results: [{ summary, resource }] }`, the `sp_list_*` tools' labeled list
 * wrappers `{ items | sites | drives | recentFiles | sharedFiles: [...] }`,
 * `sp_get_site`/`sp_get_item`'s bare Graph object, and `sp_read_file`'s
 * `{ name, webUrl, content }` object where `content` is the file's full
 * extracted text/markdown) into one {@link MCPResultSource} per
 * site/drive/file, so each citation can point at the specific document
 * instead of the whole raw JSON blob. Returns undefined (letting the caller
 * fall back) when the content isn't one of these shapes, or no entry yields
 * usable text.
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
  let parsed: SharePointPayload;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

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
