import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type ParsedFeedItem = {
  guid: string;
  link?: string;
  title?: string;
  publishedAt?: Date;
  /** Full content when the feed carries it, otherwise the summary; HTML or text. */
  contentHtml?: string;
};

export type ParsedFeed = {
  title?: string;
  siteUrl?: string;
  items: ParsedFeedItem[];
};

type Node = Record<string, unknown>;

const ARRAY_TAGS = new Set(['item', 'entry', 'link', 'outline']);

/**
 * Entity processing is off: a feed's DOCTYPE can declare entities that expand
 * exponentially. The predefined and numeric entities are decoded here instead.
 */
export const xmlParser: XMLParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

const PREDEFINED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-z]{2,4});/g, (match, entity: string) => {
    if (entity.startsWith('#x')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return PREDEFINED[entity] ?? match;
  });
}

/** Parses XML once, rejecting malformed input before any field is read. */
export function parseXml(xml: string): Node {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error('invalid_xml');
  }
  return xmlParser.parse(xml) as Node;
}

function asNode(value: unknown): Node | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Node)
    : undefined;
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function textOf(value: unknown): string | undefined {
  const node = first(value);
  const raw = typeof node === 'string' ? node : asNode(node)?.['#text'];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const decoded = decodeXmlEntities(raw).trim();
  return decoded || undefined;
}

function dateOf(value: unknown): Date | undefined {
  const text = textOf(value);
  if (!text) {
    return undefined;
  }
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time);
}

function atomLink(value: unknown): string | undefined {
  const links = (Array.isArray(value) ? value : [value]).map(asNode).filter(Boolean) as Node[];
  const alternate =
    links.find((link) => link['@_rel'] === 'alternate') ??
    links.find((link) => link['@_rel'] == null);
  const href = alternate?.['@_href'];
  return typeof href === 'string' ? decodeXmlEntities(href) : undefined;
}

function rssItem(item: Node): ParsedFeedItem | undefined {
  const link = textOf(item.link);
  const title = textOf(item.title);
  const publishedAt = dateOf(item.pubDate) ?? dateOf(item['dc:date']);
  const guid =
    textOf(item.guid) ??
    link ??
    (title ? `${title}@${publishedAt?.toISOString() ?? ''}` : undefined);
  if (!guid) {
    return undefined;
  }
  const contentHtml = textOf(item['content:encoded']) ?? textOf(item.description);
  return {
    guid,
    ...(link ? { link } : {}),
    ...(title ? { title } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(contentHtml ? { contentHtml } : {}),
  };
}

function atomEntry(entry: Node): ParsedFeedItem | undefined {
  const link = atomLink(entry.link);
  const title = textOf(entry.title);
  const publishedAt = dateOf(entry.published) ?? dateOf(entry.updated);
  const guid = textOf(entry.id) ?? link;
  if (!guid) {
    return undefined;
  }
  const contentHtml = textOf(entry.content) ?? textOf(entry.summary);
  return {
    guid,
    ...(link ? { link } : {}),
    ...(title ? { title } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(contentHtml ? { contentHtml } : {}),
  };
}

/** A repeated XML element as a list of objects, whether it appeared zero, one or many times. */
export function listOf(value: unknown): Node[] {
  if (value == null) {
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  return list.map(asNode).filter((node): node is Node => node != null);
}

/** Reads RSS 2.0, Atom and RSS 1.0 (RDF). Throws `not_a_feed` for anything else. */
export function parseFeed(xml: string): ParsedFeed {
  const doc = parseXml(xml);
  const rss = asNode(doc.rss);
  if (rss) {
    const channel = asNode(first(rss.channel)) ?? {};
    return {
      title: textOf(channel.title),
      siteUrl: textOf(channel.link),
      items: listOf(channel.item)
        .map(rssItem)
        .filter((item): item is ParsedFeedItem => !!item),
    };
  }
  const atom = asNode(doc.feed);
  if (atom) {
    return {
      title: textOf(atom.title),
      siteUrl: atomLink(atom.link),
      items: listOf(atom.entry)
        .map(atomEntry)
        .filter((item): item is ParsedFeedItem => !!item),
    };
  }
  const rdf = asNode(doc['rdf:RDF']);
  if (rdf) {
    const channel = asNode(first(rdf.channel)) ?? {};
    return {
      title: textOf(channel.title),
      siteUrl: textOf(channel.link),
      items: listOf(rdf.item)
        .map(rssItem)
        .filter((item): item is ParsedFeedItem => !!item),
    };
  }
  throw new Error('not_a_feed');
}
