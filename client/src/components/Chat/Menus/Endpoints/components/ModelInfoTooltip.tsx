// Deloitte Custom Change: thin wrapper around @librechat/client's gel ModelInfoTooltip —
// resolves spec/pricing/context data, the icon, the sanitized description, and localized
// strings, then hands the result to the shared presentational component (which has no
// app hooks of its own, so it can live in the shared package alongside RatingMeter).
import { resolveModelCatalogKey } from 'librechat-data-provider';
import { ModelInfoTooltip as GelModelInfoTooltip } from '@librechat/client';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { getModelCost, formatPrice } from './ModelCost';
import { useTokenConfigQuery } from '~/data-provider';
import SpecDescription from './SpecDescription';
import { formatTokens } from '~/utils';
import { useLocalize } from '~/hooks';
import SpecIcon from './SpecIcon';

interface ModelInfoTooltipProps {
  spec: TModelSpec;
  endpointsConfig: TEndpointsConfig;
  agentAvatarURL?: string;
  children: ReactNode;
}

export default function ModelInfoTooltip({
  spec,
  endpointsConfig,
  agentAvatarURL,
  children,
}: ModelInfoTooltipProps) {
  const localize = useLocalize();
  const { modelPricing = {} } = useModelSelectorContext();
  const { data: tokenConfig } = useTokenConfigQuery();

  const details = spec.details;
  const pricing = getModelCost(spec.preset.model, spec.preset.endpoint, modelPricing);
  const lookupEndpoint = resolveModelCatalogKey(spec.preset.endpoint, tokenConfig);
  const contextTokens = tokenConfig?.[lookupEndpoint]?.[spec.preset.model ?? '']?.context;
  const supports = [
    details?.supports?.webSearch && localize('com_ui_web_search'),
    details?.supports?.imageGeneration && localize('com_ui_model_details_image_generation'),
    details?.supports?.fileIngestion && localize('com_ui_model_details_file_ingestion'),
  ].filter((label): label is string => Boolean(label));

  const hasDetails =
    details != null || pricing != null || (contextTokens != null && contextTokens > 0);
  if (!hasDetails) {
    return <>{children}</>;
  }

  return (
    <GelModelInfoTooltip
      icon={
        <SpecIcon
          currentSpec={spec}
          endpointsConfig={endpointsConfig}
          agentAvatarURL={agentAvatarURL}
          size={32}
        />
      }
      group={spec.group}
      label={spec.label}
      description={<SpecDescription description={spec.description} />}
      speed={details?.speed}
      intelligence={details?.intelligence}
      cost={
        pricing
          ? {
              tier: pricing.tier,
              isHighCost: pricing.isHighCost,
              inputText: localize('com_ui_model_details_cost_input', {
                0: formatPrice(pricing.inputPer1M),
              }),
              outputText: localize('com_ui_model_details_cost_output', {
                0: formatPrice(pricing.outputPer1M),
              }),
            }
          : undefined
      }
      contextLabel={
        contextTokens != null && contextTokens > 0 ? formatTokens(contextTokens) : undefined
      }
      supports={supports}
      labels={{
        ariaLabel: localize('com_ui_model_details'),
        speed: localize('com_ui_model_details_speed'),
        intelligence: localize('com_ui_model_details_intelligence'),
        cost: localize('com_ui_model_details_cost'),
        highCost: localize('com_ui_model_details_high_cost'),
        context: localize('com_ui_model_details_context'),
        supports: localize('com_ui_model_details_supports'),
      }}
    >
      {children}
    </GelModelInfoTooltip>
  );
}
