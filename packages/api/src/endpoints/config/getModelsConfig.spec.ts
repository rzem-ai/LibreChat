import type { TModelsConfig } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn().mockResolvedValue(true);
const mockCacheDelete = jest.fn().mockResolvedValue(true);
const mockCacheClear = jest.fn().mockResolvedValue(undefined);
jest.mock('~/cache', () => ({
  standardCache: jest.fn().mockImplementation(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
    delete: mockCacheDelete,
    clear: mockCacheClear,
  })),
}));

import {
  createGetModelsConfig,
  invalidateModelsConfig,
  clearModelsConfigCache,
} from './getModelsConfig';

describe('createGetModelsConfig', () => {
  const buildReq = (tenantId: string, userId: string): ServerRequest =>
    ({ user: { tenantId, id: userId } }) as unknown as ServerRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(undefined);
  });

  it('returns the cached value without invoking the loaders on a cache hit', async () => {
    const cached: TModelsConfig = { openAI: ['gpt'] } as unknown as TModelsConfig;
    mockCacheGet.mockResolvedValue(cached);
    const loadDefaultModels = jest.fn();
    const loadConfigModels = jest.fn();
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });

    const result = await getModelsConfig(buildReq('t1', 'u1'));

    expect(result).toBe(cached);
    expect(loadDefaultModels).not.toHaveBeenCalled();
    expect(loadConfigModels).not.toHaveBeenCalled();
  });

  it('collapses concurrent cache misses for the same key into a single discovery pass', async () => {
    let resolveDefault: (value: TModelsConfig) => void = () => {};
    const defaultPromise = new Promise<TModelsConfig>((resolve) => {
      resolveDefault = resolve;
    });
    const loadDefaultModels = jest.fn().mockReturnValue(defaultPromise);
    const loadConfigModels = jest.fn().mockResolvedValue({});
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });

    const req = buildReq('t1', 'u1');
    const first = getModelsConfig(req);
    const second = getModelsConfig(req);

    resolveDefault({ openAI: ['gpt'] } as unknown as TModelsConfig);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(loadDefaultModels).toHaveBeenCalledTimes(1);
    expect(loadConfigModels).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual({ openAI: ['gpt'] });
    expect(secondResult).toEqual({ openAI: ['gpt'] });
  });

  it('loads independently for different cache keys', async () => {
    const loadDefaultModels = jest.fn().mockResolvedValue({});
    const loadConfigModels = jest.fn().mockResolvedValue({});
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
      .mockResolvedValueOnce({ openAI: ['gpt'] });
    const loadConfigModels = jest.fn().mockResolvedValue({});
    const getModelsConfig = createGetModelsConfig({ loadDefaultModels, loadConfigModels });

    const req = buildReq('t1', 'u1');
    await expect(getModelsConfig(req)).rejects.toThrow('discovery failed');

    const result = await getModelsConfig(req);

    expect(result).toEqual({ openAI: ['gpt'] });
    expect(loadDefaultModels).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateModelsConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes only the requesting tenant/user cache entry', async () => {
    await invalidateModelsConfig({
      user: { tenantId: 't1', id: 'u1' },
    } as unknown as ServerRequest);

    expect(mockCacheDelete).toHaveBeenCalledWith('t1:u1');
  });
});

describe('clearModelsConfigCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears the entire MODELS_CONFIG namespace', async () => {
    await clearModelsConfigCache();

    expect(mockCacheClear).toHaveBeenCalledTimes(1);
  });
});
