import type { TModelPricing } from 'librechat-data-provider';
import { useModelSelectorContext } from '../ModelSelectorContext';

function formatPrice(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })}`;
}

export function getModelCost(
  modelId: string | null | undefined,
  modelPricing: TModelPricing = {},
) {
  if (!modelId) {
    return undefined;
  }

  return modelPricing[modelId] ?? modelPricing[modelId.split('/').pop() ?? ''];
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
      title={`Input ${formatPrice(pricing.inputPer1M)} / 1M tokens, output ${formatPrice(
        pricing.outputPer1M,
      )} / 1M tokens`}
    >
      {formatPrice(pricing.inputPer1M)} in / {formatPrice(pricing.outputPer1M)} out
    </span>
  );
}
