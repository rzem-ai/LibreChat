import { EModelEndpoint, normalizeEndpointName } from 'librechat-data-provider';
import type { TModelsConfig, TTokenConfigMap, TEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { EndpointTokenConfig } from '~/types';
import { buildTokenConfigMap, type TokenomicsDeps } from '~/endpoints/pricing';
import { getTokenConfigKey } from '~/endpoints/custom/initialize';
import { tokenConfigCache } from '~/cache';

export interface ResolveTokenConfigParams {
  appConfig?: AppConfig;
  /** endpoint → model list, from the resolved models config */
  modelsConfig: TModelsConfig;
  userId: string;
  tenantId?: string | null;
}

// Deloitte Custom Change: tokenConfig is now schema-legal on every endpoint, not just
// `custom` — named endpoints that can carry a static `tokenConfig` (non-custom, non-array).
const NAMED_TOKEN_CONFIG_ENDPOINTS = [
  EModelEndpoint.openAI,
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.assistants,
  EModelEndpoint.azureAssistants,
  EModelEndpoint.agents,
  EModelEndpoint.bedrock,
] as const;

/**
 * Flattens every endpoint's static yaml `tokenConfig` into a single map keyed
 * by normalized endpoint name — custom endpoints by their configured `name`,
 * named endpoints (anthropic, bedrock, etc.) by their `EModelEndpoint` key.
 *
 * Deloitte Custom Change: extracted from `resolveTokenConfigMap` and generalized
 * to scan every endpoint type (it previously only scanned `custom`), so this map
 * also backs the relative-cost badge in `getModelPricing` (`~/config/modelPricing`).
 */
export function collectTokenConfigOverrides(
  appConfig?: AppConfig,
): Record<string, EndpointTokenConfig | undefined> {
  const overrides: Record<string, EndpointTokenConfig | undefined> = {};

  const customEndpoints = (appConfig?.endpoints?.[EModelEndpoint.custom] ?? []) as TEndpoint[];
  for (const endpointConfig of customEndpoints) {
    const name = normalizeEndpointName(endpointConfig?.name);
    if (name && endpointConfig.tokenConfig != null) {
      overrides[name] = endpointConfig.tokenConfig as EndpointTokenConfig;
    }
  }

  for (const endpoint of NAMED_TOKEN_CONFIG_ENDPOINTS) {
    const endpointConfig = appConfig?.endpoints?.[endpoint] as
      | { tokenConfig?: EndpointTokenConfig }
      | undefined;
    if (endpointConfig?.tokenConfig != null) {
      overrides[endpoint] = endpointConfig.tokenConfig;
    }
  }

  return overrides;
}

/**
 * Server-side token-config resolution for the `/endpoints/token-config`
 * route. Gathers every endpoint's override — a static yaml `tokenConfig` or,
 * for custom endpoints only, the cached fetched config — then resolves
 * context windows (and pricing, when `interface.contextCost` is enabled) via
 * {@link buildTokenConfigMap}. Lives in TypeScript so the `/api` controller
 * stays a thin wrapper.
 */
export async function resolveTokenConfigMap(
  { appConfig, modelsConfig, userId, tenantId }: ResolveTokenConfigParams,
  deps: TokenomicsDeps,
): Promise<TTokenConfigMap> {
  const includePricing = appConfig?.interfaceConfig?.contextCost === true;
  const customEndpoints = (appConfig?.endpoints?.[EModelEndpoint.custom] ?? []) as TEndpoint[];
  const cache = tokenConfigCache();
  const endpointTokenConfigs = collectTokenConfigOverrides(appConfig);

  for (const endpointConfig of customEndpoints) {
    /** Models config and the token-config cache key by the normalized name */
    const name = normalizeEndpointName(endpointConfig?.name);
    if (!name || endpointTokenConfigs[name] != null) {
      continue;
    }
    /** Model fetches and chat initialization both store under this key —
     *  user-scoped whenever the fetched config can be user-specific */
    const tokenKey = getTokenConfigKey(endpointConfig, name, userId, tenantId);
    const cached = (await cache.get(tokenKey)) as EndpointTokenConfig | undefined;
    if (cached) {
      endpointTokenConfigs[name] = cached;
    }
  }

  return buildTokenConfigMap({ modelsConfig, endpointTokenConfigs, includePricing }, deps);
}
