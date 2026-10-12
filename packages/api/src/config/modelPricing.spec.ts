import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

const mockCacheGet = jest.fn();
jest.mock('~/cache', () => ({
  tokenConfigCache: jest.fn(() => ({ get: (key: string) => mockCacheGet(key) })),
}));

import { getModelPricing } from './modelPricing';

function buildAppConfig(
  overrides: Partial<AppConfig> & {
    showModelPricingIndicator?: boolean;
    modelPricingTierBreakpoints?: number[];
  },
): AppConfig {
  const { showModelPricingIndicator = true, modelPricingTierBreakpoints, ...rest } = overrides;
  return {
    interfaceConfig: {
      customDeloitteFeatureFlags: {
        showModelPricingIndicator,
        ...(modelPricingTierBreakpoints ? { modelPricingTierBreakpoints } : {}),
      },
    },
    ...rest,
  } as unknown as AppConfig;
}

describe('getModelPricing', () => {
  beforeEach(() => mockCacheGet.mockReset().mockResolvedValue(null));

  it('returns an empty map when the showModelPricingIndicator flag is not enabled', async () => {
    expect(await getModelPricing(undefined, 'user-1')).toEqual({});
    expect(await getModelPricing({ endpoints: {} } as unknown as AppConfig, 'user-1')).toEqual({});
    expect(
      await getModelPricing(
        buildAppConfig({
          showModelPricingIndicator: false,
          endpoints: {
            [EModelEndpoint.custom]: [
              {
                name: 'Azure Global',
                tokenConfig: { 'test-model': { prompt: 1, completion: 1, context: 1 } },
              },
            ],
          },
        } as Partial<AppConfig>),
        'user-1',
      ),
    ).toEqual({});
  });

  it('returns an empty map when no custom endpoint has a tokenConfig', async () => {
    expect(
      await getModelPricing(buildAppConfig({ endpoints: {} } as Partial<AppConfig>), 'user-1'),
    ).toEqual({});
  });

  it('does not price built-in (non-custom) endpoints', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.anthropic]: {
          tokenConfig: {
            'claude-sonnet-4-6': { prompt: 3, completion: 15, context: 200000 },
          },
        },
      },
    } as Partial<AppConfig>);

    expect(await getModelPricing(appConfig, 'user-1')).toEqual({});
  });

  it('flattens a custom endpoint tokenConfig, keyed by the endpoint name', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'Azure Global',
            tokenConfig: {
              'gpt-56-luna': { prompt: 1, completion: 6, context: 128000 },
            },
          },
        ],
      },
    } as Partial<AppConfig>);

    expect(await getModelPricing(appConfig, 'user-1')).toEqual({
      'Azure Global:gpt-56-luna': {
        inputPer1M: 1,
        outputPer1M: 6,
        provider: 'Azure Global',
        tier: 2,
      },
    });
  });

  it('merges tokenConfig across every custom endpoint into a single map', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'VertexAI US',
            tokenConfig: {
              'google/gemini-2.5-pro': { prompt: 1.25, completion: 10, context: 1000000 },
            },
          },
          {
            name: 'Azure Global',
            tokenConfig: {
              'gpt-56-luna': { prompt: 1, completion: 6, context: 128000 },
            },
          },
        ],
      },
    } as Partial<AppConfig>);

    expect(await getModelPricing(appConfig, 'user-1')).toEqual({
      'VertexAI US:google/gemini-2.5-pro': {
        inputPer1M: 1.25,
        outputPer1M: 10,
        provider: 'VertexAI US',
        tier: 3,
      },
      'Azure Global:gpt-56-luna': {
        inputPer1M: 1,
        outputPer1M: 6,
        provider: 'Azure Global',
        tier: 2,
      },
    });
  });

  it('keeps pricing for the same model separate per custom endpoint', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'Azure Global',
            tokenConfig: { 'shared-model': { prompt: 1, completion: 1, context: 1 } },
          },
          {
            name: 'VertexAI US',
            tokenConfig: { 'shared-model': { prompt: 10, completion: 10, context: 1 } },
          },
        ],
      },
    } as Partial<AppConfig>);

    expect(await getModelPricing(appConfig, 'user-1')).toMatchObject({
      'Azure Global:shared-model': { inputPer1M: 1, outputPer1M: 1 },
      'VertexAI US:shared-model': { inputPer1M: 10, outputPer1M: 10 },
    });
  });

  it('falls back to the cached fetched config when a custom endpoint has no static tokenConfig', async () => {
    mockCacheGet.mockResolvedValue({
      'fetched-model': { prompt: 4, completion: 20, context: 32000 },
    });
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [{ name: 'MyProxy', models: { fetch: true } }],
      },
    } as Partial<AppConfig>);

    expect(await getModelPricing(appConfig, 'user-1')).toEqual({
      'MyProxy:fetched-model': {
        inputPer1M: 4,
        outputPer1M: 20,
        provider: 'MyProxy',
        tier: 4,
      },
    });
  });

  it.each([
    [0, 1],
    [1.99, 1],
    [2, 2],
    [4.99, 2],
    [5, 3],
    [7.99, 3],
    [8, 4],
    [14.99, 4],
    [15, 5],
    [100, 5],
  ])('maps a blended cost of $%s/1M to tier %i', async (blendedCost, expectedTier) => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'Azure Global',
            tokenConfig: {
              'test-model': { prompt: blendedCost, completion: blendedCost, context: 1 },
            },
          },
        ],
      },
    } as Partial<AppConfig>);

    const pricing = await getModelPricing(appConfig, 'user-1');
    expect(pricing['Azure Global:test-model'].tier).toBe(expectedTier);
  });

  it('uses custom modelPricingTierBreakpoints from customDeloitteFeatureFlags when provided', async () => {
    const appConfig = buildAppConfig({
      modelPricingTierBreakpoints: [1, 2, 3, 4],
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'Azure Global',
            tokenConfig: { 'test-model': { prompt: 3, completion: 3, context: 1 } },
          },
        ],
      },
    } as Partial<AppConfig>);

    const pricing = await getModelPricing(appConfig, 'user-1');
    expect(pricing['Azure Global:test-model'].tier).toBe(4);
  });

  it('falls back to the default breakpoints when modelPricingTierBreakpoints is absent', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'Azure Global',
            tokenConfig: { 'test-model': { prompt: 3, completion: 3, context: 1 } },
          },
        ],
      },
    } as Partial<AppConfig>);

    const pricing = await getModelPricing(appConfig, 'user-1');
    expect(pricing['Azure Global:test-model'].tier).toBe(2);
  });
});
