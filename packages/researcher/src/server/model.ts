import { initializeModel } from '@librechat/agents';
import { getProviderConfig, omitTitleOptions } from '@librechat/api';
import type { ClientOptions, Providers } from '@librechat/agents';
import type { AppConfig, IUser } from '@librechat/data-schemas';
import type { EndpointDbMethods } from '@librechat/api';
import type { NativeSearchInvoke } from './search';
import type { ModelInvoke } from './verifier';
import { NATIVE_SEARCH_ENDPOINT, SearchError } from './search';

const VERIFY_TIMEOUT_MS = 60_000;
const SEARCH_TIMEOUT_MS = 60_000;

type ResearchModelDeps = {
  appConfig: AppConfig;
  user: Pick<IUser, 'id' | 'role' | 'tenantId'> & { id: string };
  endpoint: string;
  model: string;
  db: EndpointDbMethods;
};

type InvokableModel = {
  invoke: (input: string, config?: object) => Promise<{ content?: unknown }>;
  bindTools?: (tools: object[]) => InvokableModel;
};

type BuiltModel = { model: InvokableModel; provider: Providers; tools: object[] };

function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === 'string' ? block : ((block as { text?: string })?.text ?? ''),
      )
      .join('');
  }
  return '';
}

/**
 * Builds a request-free, non-streaming model on `endpoint` (an endpoint name from
 * librechat.yaml, such as the LLM gateway). Generation options of the primary agent are
 * dropped like the title path does; the Anthropic `clientOptions` carrier is kept by
 * reference because it holds the SSRF-safe fetch options for user-set URLs. Provider tools
 * the endpoint returns for `modelParameters` (such as built-in web search) come back unbound.
 */
async function buildResearchModel(
  deps: ResearchModelDeps,
  modelParameters: Record<string, unknown> = {},
): Promise<BuiltModel> {
  const providerConfig = getProviderConfig({
    provider: deps.endpoint,
    appConfig: deps.appConfig,
  });
  const options = await providerConfig.getOptions({
    runtime: { appConfig: deps.appConfig, user: deps.user as IUser, requestBody: {} },
    endpoint: deps.endpoint,
    model_parameters: { ...modelParameters, model: deps.model },
    db: deps.db,
  });
  const raw = { ...(options.llmConfig ?? {}) } as Record<string, unknown>;
  const carrier = raw.clientOptions;
  const clientOptions: Record<string, unknown> = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !omitTitleOptions.has(key) && key !== 'maxTokens'),
  );
  if (carrier != null && clientOptions.clientOptions == null) {
    clientOptions.clientOptions = carrier;
  }
  if (options.configOptions) {
    clientOptions.configuration = options.configOptions;
  }
  const provider = (options.provider ??
    providerConfig.overrideProvider ??
    deps.endpoint) as Providers;
  const model = (await initializeModel({
    provider,
    clientOptions: { ...clientOptions, streaming: false } as ClientOptions,
  })) as unknown as InvokableModel;
  return { model, provider, tools: (options as { tools?: object[] }).tools ?? [] };
}

/** A plain text call to `model` on `endpoint`, used by the citation verifier. */
export function createResearchModelInvoker(deps: ResearchModelDeps): ModelInvoke {
  let built: Promise<BuiltModel> | undefined;

  return async (prompt, signal) => {
    built ??= buildResearchModel(deps);
    const { model } = await built;
    const timeout = AbortSignal.timeout(VERIFY_TIMEOUT_MS);
    const response = await model.invoke(prompt, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    return extractText(response?.content);
  };
}

/** True for the endpoint's built-in web search server tool. */
function isWebSearchTool(tool: object): boolean {
  return (tool as { name?: unknown }).name === 'web_search';
}

/**
 * A call to `model` on an Anthropic endpoint with its built-in web search bound and limited to
 * one search, returning the reply's content blocks. The endpoint's `nativeWebSearch` allowlist
 * applies: a model it excludes fails as unconfigured.
 */
export function createNativeSearchInvoker(deps: ResearchModelDeps): NativeSearchInvoke {
  let bound: Promise<InvokableModel> | undefined;

  const bind = async (): Promise<InvokableModel> => {
    if (deps.endpoint !== NATIVE_SEARCH_ENDPOINT) {
      throw new SearchError(
        'search_unconfigured',
        `Built-in web search needs the ${NATIVE_SEARCH_ENDPOINT} endpoint, not "${deps.endpoint}".`,
      );
    }
    let built: BuiltModel;
    try {
      built = await buildResearchModel(deps, { web_search: true });
    } catch (error) {
      throw new SearchError(
        'search_unconfigured',
        `Built-in web search is not available: ${(error as Error)?.message ?? 'unknown error'}`,
      );
    }
    const searchTool = built.tools.find(isWebSearchTool);
    if (!searchTool || !built.model.bindTools) {
      throw new SearchError(
        'search_unconfigured',
        `Built-in web search is not enabled for model "${deps.model}".`,
      );
    }
    return built.model.bindTools([{ ...searchTool, max_uses: 1 }]);
  };

  return async (prompt, signal) => {
    bound ??= bind();
    const model = await bound;
    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    const response = await model.invoke(prompt, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    return Array.isArray(response?.content) ? response.content : [];
  };
}
