import type { LoadToolDefinitionsResult } from '@librechat/api';
import {
  getResearchToolDefinition,
  withResearchToolDefinitions,
  appendResearchToolDefinitions,
} from '../../src/server/definitions';
import { RESEARCH_TOOL_NAMES, RESEARCH_TOOL_DESCRIPTIONS } from '../../src/contract/research';
import { researchSchema } from '../../src/contract/research';
import { setResearchConfig } from '../../src/server/config';

const emptyResult = (): LoadToolDefinitionsResult => ({
  toolDefinitions: [{ name: 'web_search', description: 'search' }],
  toolRegistry: new Map(),
  hasDeferredTools: false,
  mcpToolAliases: [],
  mcpResolution: { expectedToolCount: 0, resolvedToolCount: 0 },
  oauthActionToolNames: [],
});

describe('research tool definitions', () => {
  afterEach(() => setResearchConfig());

  it('builds a JSON schema definition for every research tool', () => {
    for (const name of Object.values(RESEARCH_TOOL_NAMES)) {
      const definition = getResearchToolDefinition(name);
      expect(definition?.description).toBe(RESEARCH_TOOL_DESCRIPTIONS[name]);
      expect(definition?.parameters?.type).toBe('object');
      expect(definition?.parameters).not.toHaveProperty('$schema');
    }
    expect(getResearchToolDefinition('fetch_page')?.parameters?.properties).toHaveProperty('url');
    expect(getResearchToolDefinition('web_search')).toBeUndefined();
  });

  it('adds selected research tools only while research is enabled', () => {
    const tools = ['web_search', 'fetch_page', 'record_finding'];

    setResearchConfig(researchSchema.parse({}));
    expect(appendResearchToolDefinitions(emptyResult(), tools).toolDefinitions).toHaveLength(1);

    setResearchConfig(researchSchema.parse({ enabled: true }));
    const result = appendResearchToolDefinitions(emptyResult(), tools);
    expect(result.toolDefinitions.map(({ name }) => name)).toEqual([
      'web_search',
      'fetch_page',
      'record_finding',
    ]);
    expect([...result.toolRegistry.keys()]).toEqual(['fetch_page', 'record_finding']);
  });

  it('wraps the host loader and passes its arguments through', async () => {
    setResearchConfig(researchSchema.parse({ enabled: true }));
    const load = jest.fn(async () => emptyResult());
    const params = { userId: 'u', agentId: 'a', tools: ['submit_brief'] };
    const deps = { isBuiltInTool: () => false, getOrFetchMCPServerTools: jest.fn() };
    const result = await withResearchToolDefinitions(load)(params, deps);
    expect(load).toHaveBeenCalledWith(params, deps);
    expect(result.toolDefinitions.map(({ name }) => name)).toContain('submit_brief');
  });
});
