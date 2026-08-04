import { render, screen } from '@testing-library/react';
import type { TEndpointCostConfig, TModelPricing } from 'librechat-data-provider';
import ModelCost, { getModelCost } from '../ModelCost';

let mockModelPricing: TModelPricing;
let mockEndpointCostConfig: TEndpointCostConfig | undefined;

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    modelPricing: mockModelPricing,
    endpointCostConfig: mockEndpointCostConfig,
  }),
}));

describe('ModelCost', () => {
  beforeEach(() => {
    mockModelPricing = {
      'gpt-4.1-mini': {
        inputPer1M: 0.4,
        outputPer1M: 1.6,
      },
      'openai/gpt-4.1-mini': {
        inputPer1M: 0.4,
        outputPer1M: 1.6,
      },
      'gpt-4.1': {
        inputPer1M: 2,
        outputPer1M: 8,
      },
    };
    mockEndpointCostConfig = {
      REFERENCE_MODEL_ID: 'gpt-4.1-mini',
      MULTIPLIER_ROUNDING_INCREMENT: 0.1,
      MIN_MULTIPLIER: 0.1,
    };
  });

  it('returns the direct model pricing match when present', () => {
    expect(getModelCost('openai/gpt-4.1-mini', mockModelPricing)).toEqual({
      inputPer1M: 0.4,
      outputPer1M: 1.6,
    });
  });

  it('falls back to the providerless model id when needed', () => {
    delete mockModelPricing['openai/gpt-4.1-mini'];

    expect(getModelCost('openai/gpt-4.1-mini', mockModelPricing)).toEqual({
      inputPer1M: 0.4,
      outputPer1M: 1.6,
    });
  });

  it('renders the rounded multiplier and pricing tooltip', () => {
    render(<ModelCost modelId="gpt-4.1" />);

    const cost = screen.getByText('5x');
    expect(cost).toHaveAttribute(
      'title',
      '$2.00 (USD) per 1M input tokens, $8.00 (USD) per 1M output tokens',
    );
  });

  it('renders nothing when pricing is unavailable', () => {
    const { container } = render(<ModelCost modelId="missing-model" />);
    expect(container).toBeEmptyDOMElement();
  });
});
