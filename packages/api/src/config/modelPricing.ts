import type { TModelPricing, TModelsConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { buildTokenConfigMap, type TokenomicsDeps } from '~/endpoints/pricing';
import { collectCustomTokenConfigs } from '~/endpoints/tokenConfig';

/**
 * Deloitte Custom Change: this entire file is a Deloitte addition with no upstream
 * LibreChat equivalent. It used to read and hand-parse a bespoke `endpoint-costs.yaml`
 * ConfigMap (providers -> models -> input_per_1m/output_per_1m) to build a relative-cost
 * badge (a multiplier against a configured reference model) shown in the model selector.
 * That file has been removed — pricing now lives as native `tokenConfig` blocks on each
 * custom endpoint in `librechat.yaml` (or the fetched-and-cached config for custom
 * endpoints without a static override), and the tier is an absolute 1-5 `$` tier derived
 * from each model's own blended price, with no reference model needed. `getModelPricing`
 * below computes pricing for every model; the result feeds the model info tooltip's cost row.
 * The 4 breakpoints
 * separating the 5 tiers are configurable via `customDeloitteFeatureFlags.modelPricingTierBreakpoints`
 * in `librechat.yaml`, falling back to `DEFAULT_PRICE_TIER_BREAKPOINTS` when unset.
 * `getModelPricing` resolves every model's rate through `buildTokenConfigMap` — the
 * same override-or-multiplier resolution used for real billing: custom endpoints use their
 * static/cached `tokenConfig` override when present, and every other model (including
 * built-in OpenAI/Anthropic/Google/Bedrock endpoints, which never carry a `tokenConfig`)
 * falls back to the built-in `getMultiplier`/`getCacheMultiplier` tables — so the
 * tooltip can never advertise a rate the request isn't actually billed at. Which
 * tiers additionally earn the tooltip's "High Cost" callout is configurable via
 * `customDeloitteFeatureFlags.highCostAlertTiers`, falling back to `DEFAULT_HIGH_COST_TIERS`
 * (top tier only) when unset.
 */
const DEFAULT_PRICE_TIER_BREAKPOINTS = [2, 5, 8, 15];
const DEFAULT_HIGH_COST_TIERS = [5];

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
 * Flattens every configured model's resolved rate into the `{ inputPer1M, outputPer1M,
 * cacheReadPer1M, cacheWritePer1M, provider, tier, isHighCost }` shape, keyed by endpoint and model. Returns an empty map
 * only when no `modelsConfig` is available.
 */
export async function getModelPricing(
  appConfig: AppConfig | undefined,
  userId: string,
  tenantId: string | null | undefined,
  modelsConfig: TModelsConfig | undefined,
  deps: TokenomicsDeps,
): Promise<TModelPricing> {
  if (!modelsConfig) {
    return {};
  }
  const customDeloitteFeatureFlags = appConfig?.interfaceConfig?.customDeloitteFeatureFlags;

  const endpointTokenConfigs = await collectCustomTokenConfigs(appConfig, userId, tenantId);
  const tokenConfigMap = buildTokenConfigMap(
    { modelsConfig, endpointTokenConfigs, includePricing: true },
    deps,
  );

  const breakpoints =
    customDeloitteFeatureFlags?.modelPricingTierBreakpoints ?? DEFAULT_PRICE_TIER_BREAKPOINTS;
  const highCostTiers = new Set(
    customDeloitteFeatureFlags?.highCostAlertTiers ?? DEFAULT_HIGH_COST_TIERS,
  );
  const pricing: TModelPricing = {};

  for (const [endpoint, models] of Object.entries(tokenConfigMap)) {
    for (const [model, { prompt, completion, cacheRead, cacheWrite }] of Object.entries(models)) {
      if (prompt == null || completion == null) {
        continue;
      }
      const tier = getPriceTier((prompt + completion) / 2, breakpoints);
      pricing[`${endpoint}:${model}`] = {
        inputPer1M: prompt,
        outputPer1M: completion,
        ...(cacheRead != null && { cacheReadPer1M: cacheRead }),
        ...(cacheWrite != null && { cacheWritePer1M: cacheWrite }),
        provider: endpoint,
        tier,
        isHighCost: highCostTiers.has(tier),
      };
    }
  }

  return pricing;
}
