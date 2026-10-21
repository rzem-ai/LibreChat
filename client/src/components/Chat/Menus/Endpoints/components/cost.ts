import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelPricing, TModelSpec } from 'librechat-data-provider';

// Deloitte Custom Change: exported so ModelInfoTooltip can reuse this formatting.
export function formatPrice(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })}`;
}

export function getModelCost(
  modelId: string | null | undefined,
  endpoint: string | null | undefined,
  modelPricing: TModelPricing = {},
) {
  if (!modelId) {
    return undefined;
  }

  const modelName = modelId.replace(/^au\.anthropic\./, '').replace(/-\d{8}-v1:\d+$/, '');
  const endpointPricing = endpoint
    ? (model: string) => modelPricing[`${endpoint}:${model}`]
    : () => undefined;

  return (
    endpointPricing(modelId) ??
    endpointPricing(modelName) ??
    endpointPricing(modelId.split('/').pop() ?? '')
  );
}

type ModelPricingEntry = TModelPricing[string];

/** A model is free when neither input nor output tokens are billed. */
export function isFreePricing(pricing?: ModelPricingEntry): boolean {
  return pricing != null && pricing.inputPer1M === 0 && pricing.outputPer1M === 0;
}

export function isFreeSpec(spec: TModelSpec, modelPricing: TModelPricing = {}): boolean {
  return isFreePricing(getModelCost(spec.preset.model, spec.preset.endpoint, modelPricing));
}

export function getFreeSpecs(specs: TModelSpec[] = [], modelPricing: TModelPricing = {}) {
  return specs.filter(
    (spec) => spec.preset.endpoint !== EModelEndpoint.agents && isFreeSpec(spec, modelPricing),
  );
}
