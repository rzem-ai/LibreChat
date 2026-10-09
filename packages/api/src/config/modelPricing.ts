import type { TEndpointCostConfig, TModelPricing } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { collectTokenConfigOverrides } from '~/endpoints/tokenConfig';

/**
 * Deloitte Custom Change: this entire file is a Deloitte addition with no upstream
 * LibreChat equivalent. It used to read and hand-parse a bespoke `endpoint-costs.yaml`
 * ConfigMap (providers -> models -> input_per_1m/output_per_1m) to build the relative-cost
 * badge shown in the model selector. That file has been removed — pricing now lives as
 * native `tokenConfig` blocks on each endpoint in `librechat.yaml`, so `getModelPricing`
 * below is a pure projection over `collectTokenConfigOverrides` with no file I/O or caching
 * (appConfig is already cached upstream). `getEndpointCostConfig`'s env-var-override
 * precedence logic is unchanged from the original implementation.
 */
const DEFAULT_ENDPOINT_COST_CONFIG: TEndpointCostConfig = {
  REFERENCE_MODEL_ID: 'gpt-56-luna',
  MULTIPLIER_ROUNDING_INCREMENT: 0.1,
  MIN_MULTIPLIER: 0.1,
};

function applyEndpointCostOverrides(
  config: TEndpointCostConfig,
  referenceModelId?: string,
): TEndpointCostConfig {
  const nextConfig = { ...config };

  const envReferenceModelId = process.env.MODEL_PRICING_REFERENCE_MODEL_ID?.trim();
  if (envReferenceModelId) {
    nextConfig.REFERENCE_MODEL_ID = envReferenceModelId;
  } else if (referenceModelId?.trim()) {
    nextConfig.REFERENCE_MODEL_ID = referenceModelId.trim();
  }

  const roundingIncrement = Number(process.env.MODEL_PRICING_MULTIPLIER_ROUNDING_INCREMENT);
  if (Number.isFinite(roundingIncrement) && roundingIncrement > 0) {
    nextConfig.MULTIPLIER_ROUNDING_INCREMENT = roundingIncrement;
  }

  const minMultiplier = Number(process.env.MODEL_PRICING_MIN_MULTIPLIER);
  if (Number.isFinite(minMultiplier) && minMultiplier > 0) {
    nextConfig.MIN_MULTIPLIER = minMultiplier;
  }

  return nextConfig;
}

/**
 * Flattens every endpoint's static yaml `tokenConfig` into the relative-cost
 * badge's `{ inputPer1M, outputPer1M, provider }` shape. Pure projection over
 * the already-cached `appConfig` — no file I/O, no caching needed here.
 */
export function getModelPricing(appConfig?: AppConfig): TModelPricing {
  const overrides = collectTokenConfigOverrides(appConfig);
  const pricing: TModelPricing = {};

  for (const [endpoint, tokenConfig] of Object.entries(overrides)) {
    if (!tokenConfig) {
      continue;
    }
    for (const [model, { prompt, completion }] of Object.entries(tokenConfig)) {
      pricing[model] = { inputPer1M: prompt, outputPer1M: completion, provider: endpoint };
    }
  }

  return pricing;
}

export function getEndpointCostConfig(referenceModelId?: string): TEndpointCostConfig {
  return applyEndpointCostOverrides(DEFAULT_ENDPOINT_COST_CONFIG, referenceModelId);
}
