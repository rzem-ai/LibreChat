import type { TModelPricing } from 'librechat-data-provider';
import { useModelSelectorContext } from '../ModelSelectorContext';

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

export default function ModelCost({
  modelId,
  endpoint,
}: {
  modelId: string | null | undefined;
  endpoint: string | null | undefined;
}) {
  const { modelPricing = {}, showPricingIndicator } = useModelSelectorContext();
  const pricing = getModelCost(modelId, endpoint, modelPricing);

  if (!pricing || !showPricingIndicator) {
    return null;
  }

  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-md bg-surface-tertiary px-1.5 py-0.5 text-xs text-text-secondary"
      title={`${formatPrice(pricing.inputPer1M)} (USD) per 1M input tokens, ${formatPrice(
        pricing.outputPer1M,
      )} (USD) per 1M output tokens`}
    >
      {'$'.repeat(pricing.tier)}
    </span>
  );
}
