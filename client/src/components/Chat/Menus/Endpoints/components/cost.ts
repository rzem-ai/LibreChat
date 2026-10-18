import type { TModelPricing } from 'librechat-data-provider';

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
