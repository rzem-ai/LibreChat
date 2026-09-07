import { getEndpointCostConfig } from './modelPricing';

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
