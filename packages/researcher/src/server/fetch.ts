import axios from 'axios';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { applySSRFSafeAgentIfDirect } from '@librechat/api';
import type { AxiosRequestConfig } from 'axios';

export type FetchedPage = {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
};

/** Fetches a page for a snapshot. The default implementation is SSRF-guarded. */
export interface PageFetcher {
  fetch(url: string, signal?: AbortSignal): Promise<FetchedPage>;
}

export type PageFetchErrorCode =
  | 'fetch_invalid_url'
  | 'fetch_blocked'
  | 'fetch_too_many_redirects'
  | 'fetch_too_large'
  | 'fetch_status'
  | 'fetch_unsupported_type'
  | 'fetch_timeout'
  | 'fetch_failed';

export class PageFetchError extends Error {
  constructor(
    readonly code: PageFetchErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PageFetchError';
  }
}

const TEXT_TYPES = /^(text\/|application\/(?:json|xml|xhtml\+xml|rss\+xml|atom\+xml|ld\+json))/i;
const USER_AGENT = 'LibreChat-Research/1.0 (+https://www.librechat.ai)';

function parseHttpUrl(raw: string, base?: string): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw new PageFetchError('fetch_invalid_url', 'The URL is not valid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PageFetchError('fetch_invalid_url', 'Only http and https URLs can be fetched.');
  }
  url.hash = '';
  return url;
}

function isSSRFError(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  return (
    candidate?.code === 'ESSRF' ||
    candidate?.cause?.code === 'ESSRF' ||
    (typeof candidate?.message === 'string' && candidate.message.startsWith('SSRF protection'))
  );
}

function decodeBody(buffer: Buffer, contentType: string): string {
  const charset = /charset=([^;\s]+)/i.exec(contentType)?.[1]?.replace(/["']/g, '');
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export type ConditionalFetchResult =
  | { notModified: true }
  | (FetchedPage & { notModified: false; etag?: string; lastModified?: string });

/** Page fetcher that can also make conditional requests (feeds). */
export interface SafeFetcher extends PageFetcher {
  fetchConditional(
    url: string,
    validators: { etag?: string; lastModified?: string },
    signal?: AbortSignal,
  ): Promise<ConditionalFetchResult>;
}

const PAGE_ACCEPT = 'text/html,text/plain;q=0.9,*/*;q=0.5';
const FEED_ACCEPT =
  'application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.9,*/*;q=0.5';

function header(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : undefined;
}

/**
 * Fetches through the SSRF-guarded agents. Redirects are followed by hand so every hop
 * is re-validated (scheme, literal private IPs, and connect-time DNS resolution). One
 * deadline covers the whole redirect chain, and environment proxies are never used:
 * a proxy connects on our behalf, which would bypass the guarded agents.
 */
export function createSafePageFetcher(options: {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  allowedAddresses?: string[];
}): SafeFetcher {
  async function request(
    rawUrl: string,
    signal: AbortSignal | undefined,
    headers: Record<string, string>,
    conditional: boolean,
  ): Promise<ConditionalFetchResult> {
    let url = parseHttpUrl(rawUrl);
    const deadline = AbortSignal.timeout(options.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    for (let hop = 0; hop <= options.maxRedirects; hop++) {
      const config: AxiosRequestConfig = {
        responseType: 'arraybuffer',
        timeout: options.timeoutMs,
        maxContentLength: options.maxBytes,
        maxBodyLength: options.maxBytes,
        validateStatus: () => true,
        proxy: false,
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: combined,
      };
      try {
        applySSRFSafeAgentIfDirect(config, url.toString(), options.allowedAddresses);
      } catch (error) {
        throw isSSRFError(error)
          ? new PageFetchError('fetch_blocked', 'That address is not allowed.')
          : new PageFetchError('fetch_invalid_url', 'The URL is not valid.');
      }

      let response;
      try {
        response = await axios.get<ArrayBuffer>(url.toString(), config);
      } catch (error) {
        if (isSSRFError(error)) {
          throw new PageFetchError('fetch_blocked', 'That address is not allowed.');
        }
        if (deadline.aborted) {
          throw new PageFetchError('fetch_timeout', 'The page took too long to fetch.');
        }
        const message = (error as { message?: unknown })?.message;
        if (typeof message === 'string' && message.includes('maxContentLength')) {
          throw new PageFetchError('fetch_too_large', 'The page is larger than the fetch limit.');
        }
        throw new PageFetchError('fetch_failed', 'The page could not be fetched.');
      }

      if (conditional && response.status === 304) {
        return { notModified: true };
      }
      const location = response.headers?.location;
      if (response.status >= 300 && response.status < 400 && typeof location === 'string') {
        url = parseHttpUrl(location, url.toString());
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new PageFetchError(
          'fetch_status',
          `The page returned status ${response.status}.`,
          response.status,
        );
      }
      const contentType = String(response.headers?.['content-type'] ?? 'text/html');
      if (!TEXT_TYPES.test(contentType)) {
        throw new PageFetchError(
          'fetch_unsupported_type',
          'Only HTML and text pages can be snapshotted.',
        );
      }
      const buffer = Buffer.from(response.data);
      if (buffer.byteLength > options.maxBytes) {
        throw new PageFetchError('fetch_too_large', 'The page is larger than the fetch limit.');
      }
      const etag = header(response.headers?.etag);
      const lastModified = header(response.headers?.['last-modified']);
      return {
        notModified: false,
        finalUrl: url.toString(),
        status: response.status,
        contentType,
        body: decodeBody(buffer, contentType),
        ...(etag ? { etag } : {}),
        ...(lastModified ? { lastModified } : {}),
      };
    }
    throw new PageFetchError('fetch_too_many_redirects', 'The page redirected too many times.');
  }

  return {
    async fetch(rawUrl, signal) {
      const result = await request(rawUrl, signal, { Accept: PAGE_ACCEPT }, false);
      if (result.notModified) {
        throw new PageFetchError('fetch_status', 'The page returned status 304.', 304);
      }
      return {
        finalUrl: result.finalUrl,
        status: result.status,
        contentType: result.contentType,
        body: result.body,
      };
    },
    fetchConditional(rawUrl, validators, signal) {
      return request(
        rawUrl,
        signal,
        {
          Accept: FEED_ACCEPT,
          ...(validators.etag ? { 'If-None-Match': validators.etag } : {}),
          ...(validators.lastModified ? { 'If-Modified-Since': validators.lastModified } : {}),
        },
        true,
      );
    },
  };
}

const NON_CONTENT = [
  'script',
  'style',
  'noscript',
  'nav',
  'footer',
  'aside',
  'form',
  'svg',
  'iframe',
  'template',
];
const converter = new NodeHtmlMarkdown({ ignore: NON_CONTENT, bulletMarker: '*' });

const MAX_TITLE_CHARS = 1000;

function decodeEntities(text: string): string {
  return NodeHtmlMarkdown.translate(text).trim();
}

/** Index of `<tag` followed by whitespace or `>`, scanning linearly. */
function findOpenTag(lower: string, tag: string): number {
  let index = lower.indexOf(`<${tag}`);
  while (index !== -1) {
    const next = lower.charAt(index + tag.length + 1);
    if (next === '>' || /\s/.test(next)) {
      return index;
    }
    index = lower.indexOf(`<${tag}`, index + 1);
  }
  return -1;
}

/**
 * Picks the page's main region when it marks one, so navigation and chrome stay out.
 * Linear `indexOf` scans only: page markup is attacker-controlled, so no backtracking
 * regex runs over it.
 */
function mainRegion(html: string, lower: string): string {
  for (const tag of ['main', 'article', 'body']) {
    const open = findOpenTag(lower, tag);
    const close = lower.lastIndexOf(`</${tag}>`);
    if (open !== -1 && close > open) {
      return html.slice(open, close + tag.length + 3);
    }
  }
  return html;
}

function extractTitle(html: string, lower: string): string | undefined {
  const open = findOpenTag(lower, 'title');
  if (open === -1) {
    return undefined;
  }
  const start = lower.indexOf('>', open);
  const end = start === -1 ? -1 : lower.indexOf('</title>', start);
  if (end === -1) {
    return undefined;
  }
  const title = decodeEntities(html.slice(start + 1, Math.min(end, start + 1 + MAX_TITLE_CHARS)));
  return title || undefined;
}

/** Converts a fetched page to the markdown stored in its snapshot. */
export function pageToMarkdown(page: FetchedPage): { title?: string; markdown: string } {
  if (!/html/i.test(page.contentType)) {
    const trimmed = page.body.trim();
    return {
      markdown: /json/i.test(page.contentType) ? `\`\`\`json\n${trimmed}\n\`\`\`` : trimmed,
    };
  }
  const lower = page.body.toLowerCase();
  const title = extractTitle(page.body, lower);
  const markdown = converter
    .translate(mainRegion(page.body, lower))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { ...(title ? { title } : {}), markdown };
}
