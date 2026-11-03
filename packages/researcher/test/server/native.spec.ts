import {
  resolveSearch,
  SearchError,
  nativeSearchPrompt,
  createNativeSearchClient,
  parseNativeSearchResults,
} from '../../src/server/search';
import { createNativeSearchInvoker } from '../../src/server/model';
import { researchSchema } from '../../src/contract/research';
import { buildResearchToolDeps } from '../../src/server/runtime';

const result = (url: string, title: string, age?: string) => ({
  type: 'web_search_result',
  url,
  title,
  encrypted_content: 'opaque',
  ...(age ? { page_age: age } : {}),
});

const searchBlocks = (...items: object[]) => [
  { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'q' } },
  { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: items },
  { type: 'text', text: 'done' },
];

describe('resolveSearch', () => {
  const parse = (input: object) => researchSchema.parse({ enabled: true, ...input });

  it('uses built-in search automatically when the agents run on the anthropic endpoint', () => {
    expect(resolveSearch(parse({ agents: { provider: 'anthropic', model: 'claude-x' } }))).toEqual({
      provider: 'native',
      endpoint: 'anthropic',
      model: 'claude-x',
    });
  });

  it('uses Brave automatically for any other endpoint', () => {
    process.env.RESEARCH_TEST_BRAVE = 'brave-key';
    expect(
      resolveSearch(
        parse({
          agents: { provider: 'bedrock', model: 'm' },
          search: { braveApiKey: '${RESEARCH_TEST_BRAVE}' },
        }),
      ),
    ).toEqual({ provider: 'brave', apiKey: 'brave-key' });
    delete process.env.RESEARCH_TEST_BRAVE;
  });

  it('honours an explicit provider and a separate search endpoint and model', () => {
    expect(
      resolveSearch(parse({ agents: { provider: 'anthropic' }, search: { provider: 'brave' } }))
        .provider,
    ).toBe('brave');
    expect(
      resolveSearch(
        parse({
          agents: { provider: 'bedrock', model: 'au.anthropic.claude-sonnet' },
          search: { native: { endpoint: 'anthropic', model: 'claude-haiku' } },
        }),
      ),
    ).toEqual({ provider: 'native', endpoint: 'anthropic', model: 'claude-haiku' });
  });
});

describe('createNativeSearchClient', () => {
  it('returns the search tool result blocks, not the model prose, up to the count', async () => {
    const invoke = jest.fn(async () =>
      searchBlocks(
        result('https://a.example/1', 'A', '2 days ago'),
        result('https://b.example/2', 'B'),
        result('https://c.example/3', 'C'),
      ),
    );
    const client = createNativeSearchClient({ invoke });
    await expect(client.search('ai policy', { count: 2, freshness: 'week' })).resolves.toEqual([
      { title: 'A', url: 'https://a.example/1', age: '2 days ago' },
      { title: 'B', url: 'https://b.example/2' },
    ]);
    expect(invoke).toHaveBeenCalledWith(nativeSearchPrompt('ai policy', 'week'), undefined);
    expect(nativeSearchPrompt('ai policy', 'week')).toContain('the past week');
  });

  it('maps a search error block and a rate-limited call to search errors', async () => {
    const errored = createNativeSearchClient({
      invoke: async () => [
        {
          type: 'web_search_tool_result',
          content: { type: 'web_search_tool_result_error', error_code: 'too_many_requests' },
        },
      ],
    });
    await expect(errored.search('q')).rejects.toMatchObject({ code: 'search_rate_limited' });

    const limited = createNativeSearchClient({
      invoke: async () => Promise.reject(Object.assign(new Error('429'), { status: 429 })),
    });
    await expect(limited.search('q')).rejects.toMatchObject({ code: 'search_rate_limited' });

    const failed = createNativeSearchClient({ invoke: async () => Promise.reject(new Error('x')) });
    await expect(failed.search('q')).rejects.toBeInstanceOf(SearchError);
  });

  it('ignores malformed result items', () => {
    expect(
      parseNativeSearchResults(searchBlocks({ type: 'web_search_result', url: 7 }, { type: 'x' })),
    ).toEqual([]);
  });
});

describe('createNativeSearchInvoker', () => {
  it('refuses endpoints other than anthropic as unconfigured', async () => {
    const invoke = createNativeSearchInvoker({
      appConfig: {} as never,
      user: { id: 'u1' },
      endpoint: 'bedrock',
      model: 'm',
      db: {} as never,
    });
    await expect(invoke('prompt')).rejects.toMatchObject({ code: 'search_unconfigured' });
  });
});

describe('buildResearchToolDeps search selection', () => {
  const base = {
    methods: {} as never,
    storage: { save: jest.fn(), read: jest.fn(), remove: jest.fn() },
  };
  const native = researchSchema.parse({
    enabled: true,
    agents: { provider: 'anthropic', model: 'claude-x' },
  });

  it('searches through the built-in search when the config resolves to it', async () => {
    const nativeSearch = jest.fn(async () => searchBlocks(result('https://a.example', 'A')));
    const deps = buildResearchToolDeps({ ...base, config: native, nativeSearch });
    await expect(deps.search?.search('q')).resolves.toEqual([
      { title: 'A', url: 'https://a.example' },
    ]);
  });

  it('leaves search unconfigured when built-in search has no invoker', () => {
    expect(buildResearchToolDeps({ ...base, config: native }).search).toBeUndefined();
  });
});
