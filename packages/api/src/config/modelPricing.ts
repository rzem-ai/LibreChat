import type { TModelPricing } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { collectTokenConfigOverrides } from '~/endpoints/tokenConfig';

/**
 * Deloitte Custom Change: this entire file is a Deloitte addition with no upstream
 * LibreChat equivalent. It used to read and hand-parse a bespoke `endpoint-costs.yaml`
 * ConfigMap (providers -> models -> input_per_1m/output_per_1m) to build a relative-cost
 * badge (a multiplier against a configured reference model) shown in the model selector.
 * That file has been removed — pricing now lives as native `tokenConfig` blocks on each
 * endpoint in `librechat.yaml`, and the badge is now an absolute 1-5 `$` tier derived from
 * each model's own blended price, with no reference model needed. The badge is gated by
 * `interface.customDeloitteFeatureFlags.showModelPricingIndicator`, and the 4 breakpoints
 * separating the 5 tiers are configurable via `customDeloitteFeatureFlags.modelPricingTierBreakpoints`
 * in `librechat.yaml`, falling back to `DEFAULT_PRICE_TIER_BREAKPOINTS` when unset.
 * `getModelPricing` below is a pure projection over `collectTokenConfigOverrides` with
 * no file I/O or caching (appConfig is already cached upstream).
 */
const DEFAULT_PRICE_TIER_BREAKPOINTS = [2, 5, 8, 15];

/** Maps a blended $/1M-token cost to a 1-5 price tier, rendered as `$` to `$$$$$`. */
function getPriceTier(blendedCost: number, breakpoints: number[]): number {
  let tier = 1;
  for (const breakpoint of breakpoints) {
    if (blendedCost >= breakpoint) {
      tier += 1;
    }
  }
  return tier;
}

/**
 * Flattens every endpoint's static yaml `tokenConfig` into the price-tier
 * badge's `{ inputPer1M, outputPer1M, provider, tier }` shape. Returns an empty
 * map when `customDeloitteFeatureFlags.showModelPricingIndicator` isn't enabled,
 * so the badge stays hidden and no pricing data is sent to the client. Pure
 * projection over the already-cached `appConfig` — no file I/O, no caching needed here.
 */
export function getModelPricing(appConfig?: AppConfig): TModelPricing {
  const customDeloitteFeatureFlags = appConfig?.interfaceConfig?.customDeloitteFeatureFlags;
  if (customDeloitteFeatureFlags?.showModelPricingIndicator !== true) {
    return {};
  }

  const overrides = collectTokenConfigOverrides(appConfig);
  const breakpoints =
    customDeloitteFeatureFlags.modelPricingTierBreakpoints ?? DEFAULT_PRICE_TIER_BREAKPOINTS;
  const pricing: TModelPricing = {};

  for (const [endpoint, tokenConfig] of Object.entries(overrides)) {
    if (!tokenConfig) {
      continue;
    }
    for (const [model, { prompt, completion }] of Object.entries(tokenConfig)) {
      const tier = getPriceTier((prompt + completion) / 2, breakpoints);
      pricing[model] = { inputPer1M: prompt, outputPer1M: completion, provider: endpoint, tier };
    }
  }

  return pricing;
}
