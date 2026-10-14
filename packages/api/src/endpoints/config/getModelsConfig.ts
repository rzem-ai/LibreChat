import { Time, CacheKeys } from 'librechat-data-provider';
import type { TModelsConfig } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';
import { standardCache } from '~/cache';

export interface GetModelsConfigDeps {
  loadDefaultModels: (req: ServerRequest) => Promise<TModelsConfig>;
  loadConfigModels: (req: ServerRequest) => Promise<TModelsConfig>;
}

function modelsConfigCacheKey(req: ServerRequest): string {
  const tenantId = req.user?.tenantId ?? '';
  const userId = req.user?.id ?? '';
  return `${tenantId}:${userId}`;
}

export async function invalidateModelsConfig(req: ServerRequest): Promise<void> {
  const cache = standardCache(CacheKeys.MODELS_CONFIG);
  await cache.delete(modelsConfigCacheKey(req));
}

/**
 * Clears the entire MODELS_CONFIG cache namespace. Intended for admin config
 * mutations (e.g. role-based model permission changes), which affect the
 * catalog for potentially many tenants/users at once and are rare enough that
 * rebuilding the whole cache is cheap relative to leaving stale entries around.
 */
export async function clearModelsConfigCache(): Promise<void> {
  await standardCache(CacheKeys.MODELS_CONFIG).clear();
}

/**
 * In-flight loads keyed the same way as the cache, so concurrent callers that
 * all miss an empty/expired cache entry (e.g. the startup-config, `/api/models`,
 * and `/endpoints/token-config` routes firing together on a cold page load)
 * share one discovery pass instead of each re-running `loadDefaultModels`/
 * `loadConfigModels`. Cleared once the load settles, success or failure, so a
 * rejected load never permanently blocks later callers.
 */
const inFlightLoads = new Map<string, Promise<TModelsConfig>>();

/**
 * Wraps `loadDefaultModels`/`loadConfigModels` behind a short-TTL cache keyed by
 * tenant/user, so the startup-config, `/api/models`, and `/endpoints/token-config`
 * routes — all hit on the same page load — share one resolved result instead of
 * each re-running provider discovery and user-key lookups.
 */
export function createGetModelsConfig(deps: GetModelsConfigDeps) {
  const { loadDefaultModels, loadConfigModels } = deps;

  return async function getModelsConfig(req: ServerRequest): Promise<TModelsConfig> {
    const cache = standardCache(CacheKeys.MODELS_CONFIG);
    const cacheKey = modelsConfigCacheKey(req);
    const cached = await cache.get<TModelsConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = inFlightLoads.get(cacheKey);
    if (pending) {
      return pending;
    }

    const load = (async () => {
      const [defaultModelsConfig, customModelsConfig] = await Promise.all([
        loadDefaultModels(req),
        loadConfigModels(req),
      ]);
      const modelsConfig = { ...defaultModelsConfig, ...customModelsConfig };
      await cache.set(cacheKey, modelsConfig, Time.TWO_MINUTES);
      return modelsConfig;
    })();
    inFlightLoads.set(cacheKey, load);

    try {
      return await load;
    } finally {
      inFlightLoads.delete(cacheKey);
    }
  };
}
