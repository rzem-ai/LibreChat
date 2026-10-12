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
 * endpoints without a static override), and the badge is an absolute 1-5 `$` tier derived
 * from each model's own blended price, with no reference model needed. The badge is gated
 * by `interface.customDeloitteFeatureFlags.showModelPricingIndicator`, and the 4 breakpoints
 * separating the 5 tiers are configurable via `customDeloitteFeatureFlags.modelPricingTierBreakpoints`
 * in `librechat.yaml`, falling back to `DEFAULT_PRICE_TIER_BREAKPOINTS` when unset.
 * `getModelPricing` below resolves every model's rate through `buildTokenConfigMap` — the
 * same override-or-multiplier resolution used for real billing: custom endpoints use their
 * static/cached `tokenConfig` override when present, and every other model (including
 * built-in OpenAI/Anthropic/Google/Bedrock endpoints, which never carry a `tokenConfig`)
 * falls back to the built-in `getMultiplier`/`getCacheMultiplier` tables — so the badge can
 * never advertise a rate the request isn't actually billed at.
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
 * Flattens every configured model's resolved rate into the price-tier badge's
 * `{ inputPer1M, outputPer1M, provider, tier }` shape, keyed by endpoint and
 * model. Returns an empty map when `customDeloitteFeatureFlags.showModelPricingIndicator`
 * isn't enabled, so the badge stays hidden and no pricing data is sent to the client.
 */
export async function getModelPricing(
  appConfig: AppConfig | undefined,
  userId: string,
  tenantId: string | null | undefined,
  modelsConfig: TModelsConfig | undefined,
  deps: TokenomicsDeps,
): Promise<TModelPricing> {
  const customDeloitteFeatureFlags = appConfig?.interfaceConfig?.customDeloitteFeatureFlags;
  if (customDeloitteFeatureFlags?.showModelPricingIndicator !== true || !modelsConfig) {
    return {};
  }

  const endpointTokenConfigs = await collectCustomTokenConfigs(appConfig, userId, tenantId);
  const tokenConfigMap = buildTokenConfigMap(
    { modelsConfig, endpointTokenConfigs, includePricing: true },
    deps,
  );

  const breakpoints =
    customDeloitteFeatureFlags.modelPricingTierBreakpoints ?? DEFAULT_PRICE_TIER_BREAKPOINTS;
  const pricing: TModelPricing = {};

  for (const [endpoint, models] of Object.entries(tokenConfigMap)) {
    for (const [model, { prompt, completion }] of Object.entries(models)) {
      if (prompt == null || completion == null) {
        continue;
      }
      pricing[`${endpoint}:${model}`] = {
        inputPer1M: prompt,
        outputPer1M: completion,
        provider: endpoint,
        tier: getPriceTier((prompt + completion) / 2, breakpoints),
      };
    }
  }

  return pricing;
}
