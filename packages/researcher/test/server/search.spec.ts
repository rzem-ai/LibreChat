import { createBraveSearchClient, resolveBraveApiKey, SearchError } from '../../src/server/search';

type FetchArgs = [string, RequestInit | undefined];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createBraveSearchClient', () => {
  it('queries Brave with the subscription token and maps web results', async () => {
    const calls: FetchArgs[] = [];
    const client = createBraveSearchClient({
      apiKey: 'brave-key',
      fetch: async (url, init) => {
        calls.push([String(url), init]);
        return jsonResponse(200, {
          web: {
            results: [
              {
                title: 'Widget <strong>news</strong>',
                url: 'https://example.com/w',
                description: 'The <strong>latest</strong> on widgets',
                age: '2 days ago',
              },
              { title: 'No url' },
            ],
          },
        });
      },
    });

    const results = await client.search('widgets & gadgets', { count: 5, freshness: 'week' });

    const [url, init] = calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://api.search.brave.com/res/v1/web/search');
    expect(parsed.searchParams.get('q')).toBe('widgets & gadgets');
    expect(parsed.searchParams.get('count')).toBe('5');
    expect(parsed.searchParams.get('freshness')).toBe('pw');
    expect(new Headers(init?.headers).get('X-Subscription-Token')).toBe('brave-key');
    expect(results).toEqual([
      {
        title: 'Widget news',
        url: 'https://example.com/w',
        description: 'The latest on widgets',
        age: '2 days ago',
      },
    ]);
  });

  it('reports a rate limit with a stable code', async () => {
    const client = createBraveSearchClient({
      apiKey: 'k',
      fetch: async () => jsonResponse(429, { error: 'too many' }),
    });
    await expect(client.search('x')).rejects.toMatchObject({ code: 'search_rate_limited' });
  });

  it('reports other upstream failures without echoing the response body', async () => {
    const client = createBraveSearchClient({
      apiKey: 'k',
      fetch: async () => jsonResponse(500, { error: 'secret upstream detail' }),
    });
    const error = await client.search('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchError);
    expect((error as SearchError).code).toBe('search_failed');
    expect((error as SearchError).message).not.toContain('secret upstream detail');
  });

  it('refuses to search without a configured key', async () => {
    const fetch = jest.fn();
    const client = createBraveSearchClient({ apiKey: undefined, fetch });
    await expect(client.search('x')).rejects.toMatchObject({ code: 'search_unconfigured' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('resolveBraveApiKey', () => {
  const original = process.env.BRAVE_API_KEY;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.BRAVE_API_KEY;
    } else {
      process.env.BRAVE_API_KEY = original;
    }
  });

  it('resolves an env placeholder and treats an unset one as missing', () => {
    process.env.BRAVE_API_KEY = 'from-env';
    expect(resolveBraveApiKey('${BRAVE_API_KEY}')).toBe('from-env');
    delete process.env.BRAVE_API_KEY;
    expect(resolveBraveApiKey('${BRAVE_API_KEY}')).toBeUndefined();
    expect(resolveBraveApiKey('literal-key')).toBe('literal-key');
    expect(resolveBraveApiKey('')).toBeUndefined();
  });
});
