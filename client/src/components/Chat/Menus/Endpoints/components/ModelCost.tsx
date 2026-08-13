import type { TModelPricing } from 'librechat-data-provider';
import { useModelSelectorContext } from '../ModelSelectorContext';

function formatMultiplier(value: number) {
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })}x`;
}

function formatPrice(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })}`;
}

function getCostFactor(
  inputCost: number,
  outputCost: number,
  referenceInputCost: number,
  referenceOutputCost: number,
  roundingIncrement: number,
  minMultiplier: number,
) {
  const factor = (inputCost / referenceInputCost + outputCost / referenceOutputCost) / 2;

  return Math.max(
    Math.ceil(factor / roundingIncrement) * roundingIncrement,
    minMultiplier,
  );
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
  const { modelPricing = {}, endpointCostConfig } = useModelSelectorContext();
  const pricing = getModelCost(modelId, modelPricing);

  if (!pricing || !endpointCostConfig) {
    return null;
  }

  const { REFERENCE_MODEL_ID, MULTIPLIER_ROUNDING_INCREMENT, MIN_MULTIPLIER } =
    endpointCostConfig;
  const referencePricing = getModelCost(REFERENCE_MODEL_ID, modelPricing);

  if (!referencePricing) {
    return null;
  }

  const costFactor = getCostFactor(
    pricing.inputPer1M,
    pricing.outputPer1M,
    referencePricing.inputPer1M,
    referencePricing.outputPer1M,
    MULTIPLIER_ROUNDING_INCREMENT,
    MIN_MULTIPLIER,
  );

  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-md bg-surface-tertiary px-1.5 py-0.5 text-xs text-text-secondary"
      title={`${formatPrice(pricing.inputPer1M)} (USD) per 1M input tokens, ${formatPrice(
        pricing.outputPer1M,
      )} (USD) per 1M output tokens`}
    >
      {formatMultiplier(costFactor)}
    </span>
  );
}
