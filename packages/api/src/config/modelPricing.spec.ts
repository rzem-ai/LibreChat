import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { getModelPricing, getEndpointCostConfig } from './modelPricing';

const originalReferenceModelId = process.env.MODEL_PRICING_REFERENCE_MODEL_ID;

afterEach(() => {
  if (originalReferenceModelId === undefined) {
    delete process.env.MODEL_PRICING_REFERENCE_MODEL_ID;
    return;
  }
  process.env.MODEL_PRICING_REFERENCE_MODEL_ID = originalReferenceModelId;
});

describe('getEndpointCostConfig', () => {
  it('uses the configured YAML reference model when no environment override is set', () => {
    delete process.env.MODEL_PRICING_REFERENCE_MODEL_ID;

    expect(getEndpointCostConfig('gpt-56-luna').REFERENCE_MODEL_ID).toBe('gpt-56-luna');
  });

  it('uses the environment reference model over the YAML value', () => {
    process.env.MODEL_PRICING_REFERENCE_MODEL_ID = 'gpt-56-terra';

    expect(getEndpointCostConfig('gpt-56-luna').REFERENCE_MODEL_ID).toBe('gpt-56-terra');
  });

  it('uses the YAML value when the environment override is blank', () => {
    process.env.MODEL_PRICING_REFERENCE_MODEL_ID = '   ';

    expect(getEndpointCostConfig('gpt-56-luna').REFERENCE_MODEL_ID).toBe('gpt-56-luna');
  });

  it('uses Luna as the final fallback when neither override is configured', () => {
    delete process.env.MODEL_PRICING_REFERENCE_MODEL_ID;

    expect(getEndpointCostConfig().REFERENCE_MODEL_ID).toBe('gpt-56-luna');
  });

  it('uses Luna as the final fallback when the YAML value is blank', () => {
    delete process.env.MODEL_PRICING_REFERENCE_MODEL_ID;

    expect(getEndpointCostConfig('   ').REFERENCE_MODEL_ID).toBe('gpt-56-luna');
  });
});

describe('getModelPricing', () => {
  it('returns an empty map when no endpoint has a static tokenConfig', () => {
    expect(getModelPricing(undefined)).toEqual({});
    expect(getModelPricing({ endpoints: {} } as unknown as AppConfig)).toEqual({});
  });

  it('flattens a custom endpoint tokenConfig, keyed by the endpoint name', () => {
    const appConfig = {
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
    } as unknown as AppConfig;

    expect(getModelPricing(appConfig)).toEqual({
      'gpt-56-luna': { inputPer1M: 1, outputPer1M: 6, provider: 'Azure Global' },
    });
  });

  it('flattens a named endpoint tokenConfig, keyed by the endpoint', () => {
    const appConfig = {
      endpoints: {
        [EModelEndpoint.anthropic]: {
          tokenConfig: {
            'claude-sonnet-4-6': { prompt: 3, completion: 15, context: 200000 },
          },
        },
      },
    } as unknown as AppConfig;

    expect(getModelPricing(appConfig)).toEqual({
      'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15, provider: EModelEndpoint.anthropic },
    });
  });

  it('merges tokenConfig across every endpoint into a single map', () => {
    const appConfig = {
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
    } as unknown as AppConfig;

    expect(getModelPricing(appConfig)).toEqual({
      'google/gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10, provider: 'VertexAI US' },
      'au.anthropic.claude-haiku-4-5-20251001-v1:0': {
        inputPer1M: 1,
        outputPer1M: 5,
        provider: EModelEndpoint.bedrock,
      },
    });
  });
});
