import { createHash } from 'node:crypto';

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/gi;
const PATH_PATTERN = /\b(?:onedrive|sharepoint):\/[^\s<>"'`)\]]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
/** `href` with a quoted, bounded value: no nested quantifiers, so linear on any input. */
const HREF_PATTERN = /href\s*=\s*["']([^"'<>\s]{1,2000})["']/gi;
const DEFAULT_MAX_LINKS = 200;

function clean(match: string): string {
  return match.replace(TRAILING_PUNCTUATION, '');
}

/** URLs the user wrote, in order. */
export function extractPromptUrls(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map(clean);
}

export function normaliseReference(reference: string): string {
  return reference.trim().replace(/\/+$/, '');
}

/**
 * Document references the user named at submission: every URL plus explicit
 * `onedrive:/` and `sharepoint:/` paths. read_document accepts only these, so content
 * the agent reads cannot steer it to other files the user can access.
 */
export function extractDocumentReferences(text: string): string[] {
  const urls = extractPromptUrls(text);
  const paths = (text.match(PATH_PATTERN) ?? []).map(clean);
  return Array.from(new Set([...urls, ...paths].map(normaliseReference)));
}

/** Hash of a URL with the fragment removed and the host lower-cased; undefined if invalid. */
export function urlHash(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }
  url.hash = '';
  return createHash('sha256').update(url.href).digest('hex').slice(0, 24);
}

/** http(s) links in a page, resolved against it, de-duplicated and capped. */
export function extractLinks(
  html: string,
  baseUrl: string,
  max: number = DEFAULT_MAX_LINKS,
): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(HREF_PATTERN)) {
    if (links.size >= max) {
      break;
    }
    try {
      const url = new URL(match[1], baseUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        url.hash = '';
        links.add(url.href);
      }
    } catch {
      continue;
    }
  }
  return Array.from(links);
}
