import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
  LoadToolDefinitionsDeps,
  LoadToolDefinitionsParams,
  LoadToolDefinitionsResult,
} from '@librechat/api';
import type { ResearchToolName } from '../contract/research';
import {
  isResearchToolName,
  RESEARCH_TOOL_SCHEMAS,
  RESEARCH_TOOL_DESCRIPTIONS,
} from '../contract/research';
import { getResearchConfig } from './config';

type ToolRegistry = LoadToolDefinitionsResult['toolRegistry'];
type ResearchToolDefinition = ToolRegistry extends Map<string, infer T> ? T : never;
type LoadToolDefinitions = (
  params: LoadToolDefinitionsParams,
  deps: LoadToolDefinitionsDeps,
) => Promise<LoadToolDefinitionsResult>;

const definitionCache = new Map<ResearchToolName, ResearchToolDefinition>();

/** Builtin definition for a research tool, built from the research tool contract. */
export function getResearchToolDefinition(name: string): ResearchToolDefinition | undefined {
  if (!isResearchToolName(name)) {
    return undefined;
  }
  const cached = definitionCache.get(name);
  if (cached) {
    return cached;
  }
  const parameters = zodToJsonSchema(RESEARCH_TOOL_SCHEMAS[name], { $refStrategy: 'none' });
  delete parameters.$schema;
  const definition: ResearchToolDefinition = {
    name,
    description: RESEARCH_TOOL_DESCRIPTIONS[name],
    parameters: parameters as ResearchToolDefinition['parameters'],
    allowed_callers: ['direct'],
  };
  definitionCache.set(name, definition);
  return definition;
}

/**
 * Adds the research tools an agent selected to a loaded definition set, when research is
 * enabled. The host's tool registry does not know them, so it skips them on its own pass.
 */
export function appendResearchToolDefinitions(
  result: LoadToolDefinitionsResult,
  tools: string[] | undefined,
): LoadToolDefinitionsResult {
  if (!tools?.length || getResearchConfig()?.enabled !== true) {
    return result;
  }
  const known = new Set(result.toolDefinitions.map(({ name }) => name));
  const added = tools
    .filter((name) => !known.has(name))
    .map(getResearchToolDefinition)
    .filter((definition): definition is ResearchToolDefinition => definition != null);
  if (added.length === 0) {
    return result;
  }
  for (const definition of added) {
    result.toolRegistry.set(definition.name, definition);
  }
  return { ...result, toolDefinitions: [...result.toolDefinitions, ...added] };
}

/** Wraps the host's `loadToolDefinitions` so research tools load alongside the rest. */
export function withResearchToolDefinitions(load: LoadToolDefinitions): LoadToolDefinitions {
  return async (params, deps) =>
    appendResearchToolDefinitions(await load(params, deps), params.tools);
}
