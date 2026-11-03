import { extractEnvVariable, envVarRegex } from 'librechat-data-provider';

export type SearchResult = {
  title: string;
  url: string;
  description?: string;
  age?: string;
};

export type SearchFreshness = 'day' | 'week' | 'month' | 'year';

/** The one fetch call shape the client needs; keeps runtime-specific fetch extras out. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Discovery only: results are not snapshots and cannot be cited until fetched. */
export interface SearchClient {
  search(
    query: string,
    options?: { count?: number; freshness?: SearchFreshness; signal?: AbortSignal },
  ): Promise<SearchResult[]>;
}

export type SearchErrorCode = 'search_unconfigured' | 'search_rate_limited' | 'search_failed';

export class SearchError extends Error {
  constructor(
    readonly code: SearchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_TIMEOUT_MS = 15_000;
const FRESHNESS: Record<SearchFreshness, string> = {
  day: 'pd',
  week: 'pw',
  month: 'pm',
  year: 'py',
};

type BraveResult = { title?: unknown; url?: unknown; description?: unknown; age?: unknown };

function stripTags(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolves `researcher.search.braveApiKey`; an unresolved `${VAR}` placeholder means unset. */
export function resolveBraveApiKey(configured: string | undefined): string | undefined {
  if (!configured) {
    return undefined;
  }
  const resolved = extractEnvVariable(configured);
  if (!resolved || envVarRegex.test(resolved.trim())) {
    return undefined;
  }
  return resolved;
}

/** The research module's own Brave client (design 5.5); not a provider for other agents. */
export function createBraveSearchClient(deps: {
  apiKey: string | undefined;
  fetch?: FetchLike;
  timeoutMs?: number;
}): SearchClient {
  const fetcher: FetchLike = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async search(query, options = {}) {
      if (!deps.apiKey) {
        throw new SearchError('search_unconfigured', 'Web search is not configured.');
      }
      const url = new URL(BRAVE_ENDPOINT);
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(options.count ?? 10));
      if (options.freshness) {
        url.searchParams.set('freshness', FRESHNESS[options.freshness]);
      }
      const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

      let response: Response;
      try {
        response = await fetcher(url.toString(), {
          headers: { Accept: 'application/json', 'X-Subscription-Token': deps.apiKey },
          signal,
        });
      } catch {
        throw new SearchError('search_failed', 'Web search request failed.');
      }
      if (response.status === 429) {
        throw new SearchError(
          'search_rate_limited',
          'Web search is rate limited; try again shortly.',
        );
      }
      if (!response.ok) {
        throw new SearchError('search_failed', `Web search failed with status ${response.status}.`);
      }
      const body = (await response.json().catch(() => null)) as {
        web?: { results?: BraveResult[] };
      } | null;
      return (body?.web?.results ?? []).flatMap((result): SearchResult[] => {
        if (typeof result.url !== 'string' || typeof result.title !== 'string') {
          return [];
        }
        return [
          {
            title: stripTags(result.title),
            url: result.url,
            ...(typeof result.description === 'string'
              ? { description: stripTags(result.description) }
              : {}),
            ...(typeof result.age === 'string' ? { age: result.age } : {}),
          },
        ];
      });
    },
  };
}

/** The endpoint whose built-in web search the `native` provider uses. */
export const NATIVE_SEARCH_ENDPOINT = 'anthropic';

/** Where `search_web` gets results for this config: `auto` resolved, plus the native target. */
export type ResolvedSearch =
  | { provider: 'brave'; apiKey: string | undefined }
  | { provider: 'native'; endpoint: string; model: string | undefined };

/**
 * Resolves `researcher.search`. `auto` uses the built-in search when the search endpoint
 * (`search.native.endpoint`, else `agents.provider`) is `anthropic`, otherwise Brave.
 */
export function resolveSearch(config: {
  agents: { provider?: string; model?: string };
  search: {
    provider: 'auto' | 'brave' | 'native';
    braveApiKey: string;
    native: { endpoint?: string; model?: string };
  };
}): ResolvedSearch {
  const endpoint = config.search.native.endpoint ?? config.agents.provider;
  const native = config.search.provider === 'native';
  const auto = config.search.provider === 'auto' && endpoint === NATIVE_SEARCH_ENDPOINT;
  if ((native || auto) && endpoint) {
    return {
      provider: 'native',
      endpoint,
      model: config.search.native.model ?? config.agents.model,
    };
  }
  return { provider: 'brave', apiKey: resolveBraveApiKey(config.search.braveApiKey) };
}

/** Content blocks of one model reply; only the built-in search's result blocks are read. */
export type NativeSearchInvoke = (prompt: string, signal?: AbortSignal) => Promise<unknown[]>;

type NativeSearchBlock = {
  type?: unknown;
  content?: unknown;
};

type NativeSearchResultBlock = {
  type?: unknown;
  url?: unknown;
  title?: unknown;
  page_age?: unknown;
  error_code?: unknown;
};

const FRESHNESS_WORDS: Record<SearchFreshness, string> = {
  day: 'the past day',
  week: 'the past week',
  month: 'the past month',
  year: 'the past year',
};

/** The instruction the search model receives; it only needs to run the search once. */
export function nativeSearchPrompt(query: string, freshness?: SearchFreshness): string {
  const recency = freshness ? ` Prefer pages published in ${FRESHNESS_WORDS[freshness]}.` : '';
  return (
    `Use your web search tool exactly once with this query: ${JSON.stringify(query)}.${recency} ` +
    'Do not answer or summarise; reply with the single word "done" after the search.'
  );
}

/** Reads the built-in search's result blocks; throws on a search error block. */
export function parseNativeSearchResults(blocks: unknown[]): SearchResult[] {
  const results: SearchResult[] = [];
  for (const block of blocks as NativeSearchBlock[]) {
    if (block?.type !== 'web_search_tool_result') {
      continue;
    }
    const content = block.content as NativeSearchResultBlock | NativeSearchResultBlock[];
    if (!Array.isArray(content)) {
      const code = content?.error_code;
      throw new SearchError(
        code === 'too_many_requests' ? 'search_rate_limited' : 'search_failed',
        `Web search failed${typeof code === 'string' ? ` (${code})` : ''}.`,
      );
    }
    for (const item of content) {
      if (item?.type !== 'web_search_result') {
        continue;
      }
      if (typeof item.url !== 'string' || typeof item.title !== 'string') {
        continue;
      }
      results.push({
        title: item.title,
        url: item.url,
        ...(typeof item.page_age === 'string' ? { age: item.page_age } : {}),
      });
    }
  }
  return results;
}

/**
 * Search through a model's built-in web search (Anthropic `web_search` server tool). Results
 * are the tool's own result blocks, never the model's prose, so a page still has to be fetched
 * before it can be cited, exactly as with Brave.
 */
export function createNativeSearchClient(deps: { invoke: NativeSearchInvoke }): SearchClient {
  return {
    async search(query, options = {}) {
      let blocks: unknown[];
      try {
        blocks = await deps.invoke(nativeSearchPrompt(query, options.freshness), options.signal);
      } catch (error) {
        if (error instanceof SearchError) {
          throw error;
        }
        const status = (error as { status?: unknown })?.status;
        throw status === 429
          ? new SearchError('search_rate_limited', 'Web search is rate limited; try again shortly.')
          : new SearchError('search_failed', 'Web search request failed.');
      }
      return parseNativeSearchResults(blocks).slice(0, options.count ?? 10);
    },
  };
}
