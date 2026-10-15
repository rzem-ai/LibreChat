import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { TokenomicsDeps } from '~/endpoints/pricing';

const mockCacheGet = jest.fn();
jest.mock('~/cache', () => ({
  tokenConfigCache: jest.fn(() => ({ get: (key: string) => mockCacheGet(key) })),
}));

import { getModelPricing } from './modelPricing';

/**
 * Synthetic model identifiers for these fixtures. `deps.getMultiplier` below is a fixed
 * stub (not the real `tx.ts` table), so pricing never actually depends on a real model
 * existing — using obviously-fake names keeps these tests passing even if a real model
 * referenced here is later renamed or retired.
 */
const TEST_MODELS = {
  builtIn: 'test-builtin-model',
  customStatic: 'test-custom-model',
  namespaced: 'test-provider/test-namespaced-model',
};

const deps: TokenomicsDeps = {
  getValueKey: () => 'value-key',
  getMultiplier: ({ tokenType }) => (tokenType === 'prompt' ? 5 : 15),
  getCacheMultiplier: () => null,
};

function buildAppConfig(
  overrides: Partial<AppConfig> & {
    showModelPricingIndicator?: boolean;
    modelPricingTierBreakpoints?: number[];
    highCostAlertTiers?: number[];
  },
): AppConfig {
  const {
    showModelPricingIndicator = true,
    modelPricingTierBreakpoints,
    highCostAlertTiers,
    ...rest
  } = overrides;
  return {
    interfaceConfig: {
      customDeloitteFeatureFlags: {
        showModelPricingIndicator,
        ...(modelPricingTierBreakpoints ? { modelPricingTierBreakpoints } : {}),
        ...(highCostAlertTiers ? { highCostAlertTiers } : {}),
      },
    },
    ...rest,
  } as unknown as AppConfig;
}

describe('getModelPricing', () => {
  beforeEach(() => mockCacheGet.mockReset().mockResolvedValue(null));

  it('computes pricing regardless of the showModelPricingIndicator flag, since it only gates the in-menu chip', async () => {
    expect(
      await getModelPricing(
        { endpoints: {} } as unknown as AppConfig,
        'user-1',
        undefined,
        { [EModelEndpoint.anthropic]: [TEST_MODELS.builtIn] },
        deps,
      ),
    ).not.toEqual({});
    expect(
      await getModelPricing(
        buildAppConfig({ showModelPricingIndicator: false, endpoints: {} } as Partial<AppConfig>),
        'user-1',
        undefined,
        { [EModelEndpoint.anthropic]: [TEST_MODELS.builtIn] },
        deps,
      ),
    ).not.toEqual({});
  });

  it('returns an empty map when no modelsConfig is provided', async () => {
    expect(await getModelPricing(undefined, 'user-1', undefined, undefined, deps)).toEqual({});
    expect(
      await getModelPricing(
        buildAppConfig({ endpoints: {} } as Partial<AppConfig>),
        'user-1',
        undefined,
        undefined,
        deps,
      ),
    ).toEqual({});
  });

  it('prices a built-in endpoint model using the base billing multiplier, not a tokenConfig', async () => {
    const appConfig = buildAppConfig({ endpoints: {} } as Partial<AppConfig>);

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { [EModelEndpoint.anthropic]: [TEST_MODELS.builtIn] },
      deps,
    );

    expect(pricing[`${EModelEndpoint.anthropic}:${TEST_MODELS.builtIn}`]).toEqual({
      inputPer1M: 5,
      outputPer1M: 15,
      provider: EModelEndpoint.anthropic,
      tier: 4,
      isHighCost: false,
    });
  });

  it('prices a custom endpoint model using its static tokenConfig override, not the base multiplier', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'Azure Global',
            tokenConfig: {
              [TEST_MODELS.customStatic]: { prompt: 1, completion: 6, context: 128000 },
            },
          },
        ],
      },
    } as Partial<AppConfig>);

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { 'Azure Global': [TEST_MODELS.customStatic] },
      deps,
    );

    expect(pricing[`Azure Global:${TEST_MODELS.customStatic}`]).toEqual({
      inputPer1M: 1,
      outputPer1M: 6,
      provider: 'Azure Global',
      tier: 2,
      isHighCost: false,
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

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { MyProxy: ['fetched-model'] },
      deps,
    );

    expect(pricing['MyProxy:fetched-model']).toEqual({
      inputPer1M: 4,
      outputPer1M: 20,
      provider: 'MyProxy',
      tier: 4,
      isHighCost: false,
    });
  });

  it('falls back to the base billing multiplier for a custom endpoint model with no static or cached tokenConfig', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [{ name: 'MyProxy', models: { fetch: true } }],
      },
    } as Partial<AppConfig>);

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { MyProxy: ['unknown-model'] },
      deps,
    );

    expect(pricing['MyProxy:unknown-model']).toEqual({
      inputPer1M: 5,
      outputPer1M: 15,
      provider: 'MyProxy',
      tier: 4,
      isHighCost: false,
    });
  });

  it('merges built-in and custom endpoint pricing into a single map', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'VertexAI US',
            tokenConfig: {
              [TEST_MODELS.namespaced]: { prompt: 1.25, completion: 10, context: 1000000 },
            },
          },
        ],
      },
    } as Partial<AppConfig>);

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      {
        [EModelEndpoint.anthropic]: [TEST_MODELS.builtIn],
        'VertexAI US': [TEST_MODELS.namespaced],
      },
      deps,
    );

    expect(pricing).toEqual({
      [`${EModelEndpoint.anthropic}:${TEST_MODELS.builtIn}`]: {
        inputPer1M: 5,
        outputPer1M: 15,
        provider: EModelEndpoint.anthropic,
        tier: 4,
        isHighCost: false,
      },
      [`VertexAI US:${TEST_MODELS.namespaced}`]: {
        inputPer1M: 1.25,
        outputPer1M: 10,
        provider: 'VertexAI US',
        tier: 3,
        isHighCost: false,
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

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { 'Azure Global': ['shared-model'], 'VertexAI US': ['shared-model'] },
      deps,
    );

    expect(pricing).toMatchObject({
      'Azure Global:shared-model': { inputPer1M: 1, outputPer1M: 1 },
      'VertexAI US:shared-model': { inputPer1M: 10, outputPer1M: 10 },
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

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { 'Azure Global': ['test-model'] },
      deps,
    );
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

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { 'Azure Global': ['test-model'] },
      deps,
    );
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

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { 'Azure Global': ['test-model'] },
      deps,
    );
    expect(pricing['Azure Global:test-model'].tier).toBe(2);
  });

  it('flags only the top tier as high-cost by default when highCostAlertTiers is absent', async () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'Azure Global',
            tokenConfig: {
              'tier-4-model': { prompt: 8, completion: 8, context: 1 },
              'tier-5-model': { prompt: 15, completion: 15, context: 1 },
            },
          },
        ],
      },
    } as Partial<AppConfig>);

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { 'Azure Global': ['tier-4-model', 'tier-5-model'] },
      deps,
    );
    expect(pricing['Azure Global:tier-4-model'].isHighCost).toBe(false);
    expect(pricing['Azure Global:tier-5-model'].isHighCost).toBe(true);
  });

  it('uses custom highCostAlertTiers from customDeloitteFeatureFlags when provided', async () => {
    const appConfig = buildAppConfig({
      highCostAlertTiers: [4, 5],
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'Azure Global',
            tokenConfig: {
              'tier-3-model': { prompt: 5, completion: 5, context: 1 },
              'tier-4-model': { prompt: 8, completion: 8, context: 1 },
            },
          },
        ],
      },
    } as Partial<AppConfig>);

    const pricing = await getModelPricing(
      appConfig,
      'user-1',
      undefined,
      { 'Azure Global': ['tier-3-model', 'tier-4-model'] },
      deps,
    );
    expect(pricing['Azure Global:tier-3-model'].isHighCost).toBe(false);
    expect(pricing['Azure Global:tier-4-model'].isHighCost).toBe(true);
  });
});
