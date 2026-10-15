import type { TModelsConfig } from 'librechat-data-provider';
import type { Keyv } from 'keyv';
import type { ServerRequest } from '~/types';

type ModelsConfigModule = typeof import('./getModelsConfig');

/** One store per namespace, shared by every module instance — stands in for Redis. */
const mockStores = new Map<string, Keyv>();
jest.mock('~/cache', () => ({
  standardCache: (namespace: string): Keyv => {
    const existing = mockStores.get(namespace);
    if (existing) {
      return existing;
    }
    const { Keyv: ActualKeyv } = jest.requireActual<typeof import('keyv')>('keyv');
    const store = new ActualKeyv();
    mockStores.set(namespace, store);
    return store;
  },
}));

/** Loads an independent copy of the module (own in-flight map), like a separate worker process. */
function loadWorker(): ModelsConfigModule {
  let worker: ModelsConfigModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    worker = require('./getModelsConfig') as ModelsConfigModule;
  });
  if (!worker) {
    throw new Error('failed to load worker module');
  }
  return worker;
}

const buildReq = (tenantId: string, userId: string): ServerRequest =>
  ({ user: { tenantId, id: userId } }) as unknown as ServerRequest;

const config = (...models: string[]): TModelsConfig => ({ openAI: models }) as TModelsConfig;

const deferred = () => {
  let resolve: (value: TModelsConfig) => void = () => {};
  const promise = new Promise<TModelsConfig>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const waitForCalls = (loader: jest.Mock, count = 1): Promise<void> =>
  new Promise((resolve) => {
    const poll = (): void => {
      if (loader.mock.calls.length >= count) {
        resolve();
        return;
      }
      setImmediate(poll);
    };
    poll();
  });

const modelsStore = (): Keyv => {
  const store = [...mockStores.entries()].find(([name]) => !name.endsWith('_GENERATION'));
  if (!store) {
    throw new Error('models store not created');
  }
  return store[1];
};

describe('getModelsConfig', () => {
  beforeEach(() => {
    mockStores.clear();
  });

  it('returns the cached value without invoking the loaders on a cache hit', async () => {
    const loadDefaultModels = jest.fn().mockResolvedValue(config('gpt'));
    const loadConfigModels = jest.fn().mockResolvedValue({});
    const { createGetModelsConfig } = loadWorker();
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });
    const req = buildReq('t1', 'u1');

    await getModelsConfig(req);
    const result = await getModelsConfig(req);

    expect(result).toEqual(config('gpt'));
    expect(loadDefaultModels).toHaveBeenCalledTimes(1);
    expect(loadConfigModels).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent cache misses for the same key into a single discovery pass', async () => {
    const pending = deferred();
    const loadDefaultModels = jest.fn().mockReturnValue(pending.promise);
    const loadConfigModels = jest.fn().mockResolvedValue({});
    const { createGetModelsConfig } = loadWorker();
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });
    const req = buildReq('t1', 'u1');

    const first = getModelsConfig(req);
    const second = getModelsConfig(req);
    await waitForCalls(loadDefaultModels);
    pending.resolve(config('gpt'));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(loadDefaultModels).toHaveBeenCalledTimes(1);
    expect(loadConfigModels).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(config('gpt'));
    expect(secondResult).toEqual(config('gpt'));
  });

  it('loads independently for different cache keys', async () => {
    const loadDefaultModels = jest.fn().mockResolvedValue({});
    const loadConfigModels = jest.fn().mockResolvedValue({});
    const { createGetModelsConfig } = loadWorker();
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });

    await Promise.all([
      getModelsConfig(buildReq('t1', 'u1')),
      getModelsConfig(buildReq('t2', 'u2')),
    ]);

    expect(loadDefaultModels).toHaveBeenCalledTimes(2);
    expect(loadConfigModels).toHaveBeenCalledTimes(2);
  });

  it('does not leave a rejected load stuck in-flight for later callers', async () => {
    const loadDefaultModels = jest
      .fn()
      .mockRejectedValueOnce(new Error('discovery failed'))
      .mockResolvedValueOnce(config('gpt'));
    const loadConfigModels = jest.fn().mockResolvedValue({});
    const { createGetModelsConfig } = loadWorker();
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });
    const req = buildReq('t1', 'u1');

    await expect(getModelsConfig(req)).rejects.toThrow('discovery failed');

    await expect(getModelsConfig(req)).resolves.toEqual(config('gpt'));
    expect(loadDefaultModels).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateModelsConfig', () => {
  beforeEach(() => {
    mockStores.clear();
  });

  it('removes only the requesting tenant/user cache entry', async () => {
    const loadDefaultModels = jest.fn().mockResolvedValue(config('gpt'));
    const loadConfigModels = jest.fn().mockResolvedValue({});
    const { createGetModelsConfig, invalidateModelsConfig } = loadWorker();
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });
    await getModelsConfig(buildReq('t1', 'u1'));
    await getModelsConfig(buildReq('t1', 'u2'));

    await invalidateModelsConfig(buildReq('t1', 'u1'));

    expect(await modelsStore().get('t1:u1')).toBeUndefined();
    expect(await modelsStore().get('t1:u2')).toEqual(config('gpt'));
  });
});

describe('clearModelsConfigCache', () => {
  beforeEach(() => {
    mockStores.clear();
  });

  it('clears the entire MODELS_CONFIG namespace', async () => {
    const loadDefaultModels = jest.fn().mockResolvedValue(config('gpt'));
    const loadConfigModels = jest.fn().mockResolvedValue({});
    const { createGetModelsConfig, clearModelsConfigCache } = loadWorker();
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });
    await getModelsConfig(buildReq('t1', 'u1'));
    await getModelsConfig(buildReq('t2', 'u2'));

    await clearModelsConfigCache();

    expect(await modelsStore().get('t1:u1')).toBeUndefined();
    expect(await modelsStore().get('t2:u2')).toBeUndefined();
  });
});

describe('invalidation fencing across workers', () => {
  beforeEach(() => {
    mockStores.clear();
  });

  type Invalidate = (workerB: ModelsConfigModule, req: ServerRequest) => Promise<void>;

  const scenarios: Array<[string, Invalidate]> = [
    ['a per-user invalidation', (worker, req) => worker.invalidateModelsConfig(req)],
    ['a namespace clear', (worker) => worker.clearModelsConfigCache()],
  ];

  it.each(scenarios)(
    'worker A cannot publish or share a load started before worker B ran %s',
    async (_name, invalidate) => {
      const stale = deferred();
      const loadA = jest
        .fn()
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValueOnce(config('new'));
      const loadB = jest.fn().mockResolvedValue(config('new'));
      const noConfig = jest.fn().mockResolvedValue({});
      const workerA = loadWorker();
      const workerB = loadWorker();
      const getA = workerA.createGetModelsConfig({
        loadDefaultModels: loadA,
        loadConfigModels: noConfig,
      });
      const getB = workerB.createGetModelsConfig({
        loadDefaultModels: loadB,
        loadConfigModels: noConfig,
      });
      const req = buildReq('t1', 'u1');

      const before = getA(req);
      await waitForCalls(loadA);
      await invalidate(workerB, req);

      stale.resolve(config('old'));
      await expect(before).resolves.toEqual(config('old'));
      expect(await modelsStore().get('t1:u1')).toBeUndefined();

      await expect(getB(req)).resolves.toEqual(config('new'));
      await expect(getA(req)).resolves.toEqual(config('new'));
    },
  );

  it('does not let a later request on the same worker join a pre-invalidation load', async () => {
    const stale = deferred();
    const loadA = jest.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(config('new'));
    const noConfig = jest.fn().mockResolvedValue({});
    const workerA = loadWorker();
    const workerB = loadWorker();
    const getA = workerA.createGetModelsConfig({
      loadDefaultModels: loadA,
      loadConfigModels: noConfig,
    });
    const req = buildReq('t1', 'u1');

    const before = getA(req);
    await waitForCalls(loadA);
    await workerB.invalidateModelsConfig(req);

    await expect(getA(req)).resolves.toEqual(config('new'));
    expect(loadA).toHaveBeenCalledTimes(2);

    stale.resolve(config('old'));
    await before;
    expect(await modelsStore().get('t1:u1')).toEqual(config('new'));
  });

  it('keeps unrelated users cacheable after another user is invalidated', async () => {
    const loadDefaultModels = jest.fn().mockResolvedValue(config('gpt'));
    const noConfig = jest.fn().mockResolvedValue({});
    const worker = loadWorker();
    const getModelsConfig = worker.createGetModelsConfig({
      loadDefaultModels,
      loadConfigModels: noConfig,
    });

    await getModelsConfig(buildReq('t1', 'u2'));
    await worker.invalidateModelsConfig(buildReq('t1', 'u1'));
    await getModelsConfig(buildReq('t1', 'u2'));

    expect(loadDefaultModels).toHaveBeenCalledTimes(1);
  });
});
