import type { TModelPricing } from 'librechat-data-provider';
import { useModelSelectorContext } from '../ModelSelectorContext';

const REFERENCE_MODEL_ID = 'gpt-41';
const MULTIPLIER_ROUNDING_INCREMENT = 0.1;
const MIN_MULTIPLIER = 0.1;

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
) {
  const factor = (inputCost / referenceInputCost + outputCost / referenceOutputCost) / 2;

  return Math.max(
    Math.ceil(factor / MULTIPLIER_ROUNDING_INCREMENT) * MULTIPLIER_ROUNDING_INCREMENT,
    MIN_MULTIPLIER,
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
  const { modelPricing = {} } = useModelSelectorContext();
  const pricing = getModelCost(modelId, modelPricing);
  const referencePricing = getModelCost(REFERENCE_MODEL_ID, modelPricing);

  if (!pricing || !referencePricing) {
    return null;
  }

  const costFactor = getCostFactor(
    pricing.inputPer1M,
    pricing.outputPer1M,
    referencePricing.inputPer1M,
    referencePricing.outputPer1M,
  );

  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-md bg-surface-tertiary px-1.5 py-0.5 text-xs text-text-secondary"
      title={`Input ${formatPrice(pricing.inputPer1M)} / 1M tokens, output ${formatPrice(
        pricing.outputPer1M,
      )} / 1M tokens`}
    >
      {formatMultiplier(costFactor)}
    </span>
  );
}
