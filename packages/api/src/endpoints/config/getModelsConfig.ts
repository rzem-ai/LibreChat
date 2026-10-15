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

/**
 * Bumped on every invalidation. A load only joins/writes the cache if no invalidation
 * happened since it started, so pre-change discovery can never repopulate the cache or be
 * joined by a request made after the change.
 */
let revision = 0;

/**
 * In-flight loads keyed the same way as the cache, so concurrent callers that
 * all miss an empty/expired cache entry (e.g. the startup-config, `/api/models`,
 * and `/endpoints/token-config` routes firing together on a cold page load)
 * share one discovery pass instead of each re-running `loadDefaultModels`/
 * `loadConfigModels`. Cleared once the load settles, success or failure, so a
 * rejected load never permanently blocks later callers.
 */
const inFlightLoads = new Map<string, Promise<TModelsConfig>>();

export async function invalidateModelsConfig(req: ServerRequest): Promise<void> {
  const cacheKey = modelsConfigCacheKey(req);
  revision += 1;
  inFlightLoads.delete(cacheKey);
  await standardCache(CacheKeys.MODELS_CONFIG).delete(cacheKey);
}

/**
 * Clears the entire MODELS_CONFIG cache namespace. Intended for admin config
 * mutations (e.g. role-based model permission changes), which affect the
 * catalog for potentially many tenants/users at once and are rare enough that
 * rebuilding the whole cache is cheap relative to leaving stale entries around.
 */
export async function clearModelsConfigCache(): Promise<void> {
  revision += 1;
  inFlightLoads.clear();
  await standardCache(CacheKeys.MODELS_CONFIG).clear();
}

/**
 * Wraps `loadDefaultModels`/`loadConfigModels` behind a short-TTL cache keyed by
 * tenant/user, so the startup-config, `/api/models`, and `/endpoints/token-config`
 * routes — all hit on the same page load — share one resolved result instead of
 * each re-running provider discovery and user-key lookups.
 */
export function createGetModelsConfig(deps: GetModelsConfigDeps) {
  const { loadDefaultModels, loadConfigModels } = deps;

  return async function getModelsConfig(req: ServerRequest): Promise<TModelsConfig> {
    const startRevision = revision;
    const cache = standardCache(CacheKeys.MODELS_CONFIG);
    const cacheKey = modelsConfigCacheKey(req);
    const cached = await cache.get<TModelsConfig>(cacheKey);
    if (startRevision !== revision) {
      const [defaultModelsConfig, customModelsConfig] = await Promise.all([
        loadDefaultModels(req),
        loadConfigModels(req),
      ]);
      return { ...defaultModelsConfig, ...customModelsConfig };
    }
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
      if (startRevision !== revision) {
        return modelsConfig;
      }
      await cache.set(cacheKey, modelsConfig, Time.TWO_MINUTES);
      if (startRevision !== revision) {
        await cache.delete(cacheKey);
      }
      return modelsConfig;
    })();
    inFlightLoads.set(cacheKey, load);

    try {
      return await load;
    } finally {
      if (inFlightLoads.get(cacheKey) === load) {
        inFlightLoads.delete(cacheKey);
      }
    }
  };
}
