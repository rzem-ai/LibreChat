import { randomUUID } from 'node:crypto';
import { Time, CacheKeys } from 'librechat-data-provider';
import type { TModelsConfig } from 'librechat-data-provider';
import type { Keyv } from 'keyv';
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

const GENERATION_NAMESPACE = `${CacheKeys.MODELS_CONFIG}_GENERATION`;
const GLOBAL_GENERATION_KEY = '*';

/**
 * Invalidation fence shared through the cache store (Redis when enabled), so it holds across
 * workers: each invalidation stores a fresh random token, and a load only publishes its result
 * if the tokens it saw when it started are unchanged when it finishes. Kept in a separate
 * namespace so clearing the catalog namespace never resets it. A token that expires or goes
 * missing also reads as "changed", which fails safe (the load just isn't cached).
 */
function generationCache(): Keyv {
  return standardCache(GENERATION_NAMESPACE, Time.ONE_DAY);
}

async function readGeneration(cacheKey: string): Promise<string> {
  const cache = generationCache();
  const [global, user] = await Promise.all([
    cache.get<string>(GLOBAL_GENERATION_KEY),
    cache.get<string>(cacheKey),
  ]);
  return `${global ?? ''}|${user ?? ''}`;
}

function bumpGeneration(key: string): Promise<boolean> {
  return generationCache().set(key, randomUUID());
}

/**
 * In-flight loads keyed by cache key and generation, so concurrent callers that all miss an
 * empty/expired cache entry (e.g. the startup-config, `/api/models`, and
 * `/endpoints/token-config` routes firing together on a cold page load) share one discovery
 * pass instead of each re-running `loadDefaultModels`/`loadConfigModels`. Including the
 * generation means a request made after an invalidation never joins a pre-invalidation load.
 * Cleared once the load settles, success or failure, so a rejected load never permanently
 * blocks later callers.
 */
const inFlightLoads = new Map<string, Promise<TModelsConfig>>();

export async function invalidateModelsConfig(req: ServerRequest): Promise<void> {
  const cacheKey = modelsConfigCacheKey(req);
  await bumpGeneration(cacheKey);
  await standardCache(CacheKeys.MODELS_CONFIG).delete(cacheKey);
}

/**
 * Clears the entire MODELS_CONFIG cache namespace. Intended for admin config
 * mutations (e.g. role-based model permission changes), which affect the
 * catalog for potentially many tenants/users at once and are rare enough that
 * rebuilding the whole cache is cheap relative to leaving stale entries around.
 */
export async function clearModelsConfigCache(): Promise<void> {
  await bumpGeneration(GLOBAL_GENERATION_KEY);
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

  async function discover(req: ServerRequest): Promise<TModelsConfig> {
    const [defaultModelsConfig, customModelsConfig] = await Promise.all([
      loadDefaultModels(req),
      loadConfigModels(req),
    ]);
    return { ...defaultModelsConfig, ...customModelsConfig };
  }

  async function publish(
    cacheKey: string,
    generation: string,
    modelsConfig: TModelsConfig,
  ): Promise<void> {
    const cache = standardCache(CacheKeys.MODELS_CONFIG);
    if ((await readGeneration(cacheKey)) !== generation) {
      return;
    }
    await cache.set(cacheKey, modelsConfig, Time.TWO_MINUTES);
    if ((await readGeneration(cacheKey)) !== generation) {
      await cache.delete(cacheKey);
    }
  }

  return async function getModelsConfig(req: ServerRequest): Promise<TModelsConfig> {
    const cacheKey = modelsConfigCacheKey(req);
    const [cached, generation] = await Promise.all([
      standardCache(CacheKeys.MODELS_CONFIG).get<TModelsConfig>(cacheKey),
      readGeneration(cacheKey),
    ]);
    if (cached) {
      return cached;
    }

    const loadKey = `${cacheKey}|${generation}`;
    const pending = inFlightLoads.get(loadKey);
    if (pending) {
      return pending;
    }

    const load = (async () => {
      const modelsConfig = await discover(req);
      await publish(cacheKey, generation, modelsConfig);
      return modelsConfig;
    })();
    inFlightLoads.set(loadKey, load);

    try {
      return await load;
    } finally {
      if (inFlightLoads.get(loadKey) === load) {
        inFlightLoads.delete(loadKey);
      }
    }
  };
}
