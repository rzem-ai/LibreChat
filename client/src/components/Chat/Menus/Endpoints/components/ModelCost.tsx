import type { TModelPricing } from 'librechat-data-provider';
import { useModelSelectorContext } from '../ModelSelectorContext';

function formatPrice(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })}`;
}

export function getModelCost(modelId: string | null | undefined, modelPricing: TModelPricing = {}) {
  if (!modelId) {
    return undefined;
  }

  const modelName = modelId.replace(/^au\.anthropic\./, '').replace(/-\d{8}-v1:\d+$/, '');

  return (
    modelPricing[modelId] ?? modelPricing[modelName] ?? modelPricing[modelId.split('/').pop() ?? '']
  );
}

export default function ModelCost({ modelId }: { modelId: string | null | undefined }) {
  const { modelPricing = {} } = useModelSelectorContext();
  const pricing = getModelCost(modelId, modelPricing);

  if (!pricing) {
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
