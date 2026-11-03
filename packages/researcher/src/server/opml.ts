import { parseXml, listOf, decodeXmlEntities } from './rss';

/** `folder` is the path of folder outlines around the feed, outermost first. */
export type OpmlFeed = { url: string; title?: string; folder?: string[] };

const MAX_DEPTH = 8;

type Node = Record<string, unknown>;

function attr(node: Node, name: string): string | undefined {
  const value = node[`@_${name}`];
  return typeof value === 'string' && value.trim() ? decodeXmlEntities(value.trim()) : undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Feeds listed in an OPML document, in order, de-duplicated by URL. Only http(s) feed
 * URLs are kept; a folder outline's text becomes the category of the feeds inside it.
 */
export function parseOpml(xml: string): OpmlFeed[] {
  const doc = parseXml(xml);
  const opml = doc.opml as Node | undefined;
  const body = opml?.body as Node | undefined;
  if (!opml || typeof opml !== 'object') {
    throw new Error('not_opml');
  }
  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();
  const walk = (list: Node[], folder: string[], depth: number) => {
    if (depth > MAX_DEPTH) {
      return;
    }
    for (const node of list) {
      const url = attr(node, 'xmlUrl');
      if (url) {
        if (isHttpUrl(url) && !seen.has(url)) {
          seen.add(url);
          const title = attr(node, 'title') ?? attr(node, 'text');
          feeds.push({
            url,
            ...(title ? { title } : {}),
            ...(folder.length ? { folder } : {}),
          });
        }
        continue;
      }
      const name = attr(node, 'text') ?? attr(node, 'title');
      walk(listOf(node.outline), name ? [...folder, name] : folder, depth + 1);
    }
  };
  walk(listOf(body?.outline), [], 0);
  return feeds;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type FolderTree = { feeds: OpmlFeed[]; folders: Map<string, FolderTree> };

function feedLine(feed: OpmlFeed, indent: string): string {
  const text = escapeAttr(feed.title ?? feed.url);
  return `${indent}<outline type="rss" text="${text}" title="${text}" xmlUrl="${escapeAttr(feed.url)}"/>`;
}

function renderTree(tree: FolderTree, depth: number): string[] {
  const indent = '  '.repeat(depth + 2);
  const lines: string[] = [];
  for (const [name, child] of tree.folders) {
    const text = escapeAttr(name);
    lines.push(`${indent}<outline text="${text}" title="${text}">`);
    lines.push(...renderTree(child, depth + 1));
    lines.push(`${indent}</outline>`);
  }
  lines.push(...tree.feeds.map((feed) => feedLine(feed, indent)));
  return lines;
}

/** OPML 2.0 for a user's subscriptions, with folder paths as nested outlines. */
export function buildOpml(feeds: OpmlFeed[], title: string): string {
  const root: FolderTree = { feeds: [], folders: new Map() };
  for (const feed of feeds) {
    let node = root;
    for (const name of (feed.folder ?? []).slice(0, MAX_DEPTH)) {
      let next = node.folders.get(name);
      if (!next) {
        next = { feeds: [], folders: new Map() };
        node.folders.set(name, next);
      }
      node = next;
    }
    node.feeds.push(feed);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${escapeAttr(title)}</title></head>`,
    '  <body>',
    ...renderTree(root, 0),
    '  </body>',
    '</opml>',
    '',
  ].join('\n');
}
