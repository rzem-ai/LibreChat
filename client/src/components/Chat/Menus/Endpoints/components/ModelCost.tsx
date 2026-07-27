import type { TModelPricing } from 'librechat-data-provider';
import { useModelSelectorContext } from '../ModelSelectorContext';

function formatMultiplier(value: number) {
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })}x`;
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
      title={`Input ${formatMultiplier(pricing.inputPer1M)}, output ${formatMultiplier(
        pricing.outputPer1M,
      )}`}
    >
      {formatMultiplier(pricing.inputPer1M)} in / {formatMultiplier(pricing.outputPer1M)} out
    </span>
  );
}
