import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
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
  it('returns an empty map when the showModelPricingIndicator flag is not enabled', () => {
    expect(getModelPricing(undefined)).toEqual({});
    expect(getModelPricing({ endpoints: {} } as unknown as AppConfig)).toEqual({});
    expect(
      getModelPricing(
        buildAppConfig({
          showModelPricingIndicator: false,
          endpoints: {
            [EModelEndpoint.anthropic]: {
              tokenConfig: { 'test-model': { prompt: 1, completion: 1, context: 1 } },
            },
          },
        } as Partial<AppConfig>),
      ),
    ).toEqual({});
  });

  it('returns an empty map when no endpoint has a static tokenConfig', () => {
    expect(getModelPricing(buildAppConfig({ endpoints: {} } as Partial<AppConfig>))).toEqual({});
  });

  it('flattens a custom endpoint tokenConfig, keyed by the endpoint name', () => {
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

    expect(getModelPricing(appConfig)).toEqual({
      'gpt-56-luna': { inputPer1M: 1, outputPer1M: 6, provider: 'Azure Global', tier: 2 },
    });
  });

  it('flattens a named endpoint tokenConfig, keyed by the endpoint', () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.anthropic]: {
          tokenConfig: {
            'claude-sonnet-4-6': { prompt: 3, completion: 15, context: 200000 },
          },
        },
      },
    } as Partial<AppConfig>);

    expect(getModelPricing(appConfig)).toEqual({
      'claude-sonnet-4-6': {
        inputPer1M: 3,
        outputPer1M: 15,
        provider: EModelEndpoint.anthropic,
        tier: 4,
      },
    });
  });

  it('merges tokenConfig across every endpoint into a single map', () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.custom]: [
          {
            name: 'VertexAI US',
            tokenConfig: {
              'google/gemini-2.5-pro': { prompt: 1.25, completion: 10, context: 1000000 },
            },
          },
        ],
        [EModelEndpoint.bedrock]: {
          tokenConfig: {
            'au.anthropic.claude-haiku-4-5-20251001-v1:0': {
              prompt: 1,
              completion: 5,
              context: 200000,
            },
          },
        },
      },
    } as Partial<AppConfig>);

    expect(getModelPricing(appConfig)).toEqual({
      'google/gemini-2.5-pro': {
        inputPer1M: 1.25,
        outputPer1M: 10,
        provider: 'VertexAI US',
        tier: 3,
      },
      'au.anthropic.claude-haiku-4-5-20251001-v1:0': {
        inputPer1M: 1,
        outputPer1M: 5,
        provider: EModelEndpoint.bedrock,
        tier: 2,
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
  ])('maps a blended cost of $%s/1M to tier %i', (blendedCost, expectedTier) => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.anthropic]: {
          tokenConfig: {
            'test-model': { prompt: blendedCost, completion: blendedCost, context: 1 },
          },
        },
      },
    } as Partial<AppConfig>);

    expect(getModelPricing(appConfig)['test-model'].tier).toBe(expectedTier);
  });

  it('uses custom modelPricingTierBreakpoints from customDeloitteFeatureFlags when provided', () => {
    const appConfig = buildAppConfig({
      modelPricingTierBreakpoints: [1, 2, 3, 4],
      endpoints: {
        [EModelEndpoint.anthropic]: {
          tokenConfig: {
            'test-model': { prompt: 3, completion: 3, context: 1 },
          },
        },
      },
    } as Partial<AppConfig>);

    expect(getModelPricing(appConfig)['test-model'].tier).toBe(4);
  });

  it('falls back to the default breakpoints when modelPricingTierBreakpoints is absent', () => {
    const appConfig = buildAppConfig({
      endpoints: {
        [EModelEndpoint.anthropic]: {
          tokenConfig: {
            'test-model': { prompt: 3, completion: 3, context: 1 },
          },
        },
      },
    } as Partial<AppConfig>);

    expect(getModelPricing(appConfig)['test-model'].tier).toBe(2);
  });
});
