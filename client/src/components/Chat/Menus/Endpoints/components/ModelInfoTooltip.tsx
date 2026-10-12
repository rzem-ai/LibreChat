// Deloitte Custom Change: new file — hover tooltip surfacing various model details
// for a model spec, reusing existing primitives (HoverCard, RatingMeter).
import { resolveModelCatalogKey } from 'librechat-data-provider';
import {
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
  RatingMeter,
} from '@librechat/client';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { getModelCost, formatPrice } from './ModelCost';
import { useTokenConfigQuery } from '~/data-provider';
import SpecDescription from './SpecDescription';
import { formatTokens } from '~/utils';
import { useLocalize } from '~/hooks';
import SpecIcon from './SpecIcon';

// Deloitte Custom Change: fixed-width label + flexible content row, matching the Figma
// "AI Model Tooltip" row layout (label column, then meter/value column).
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-8">
      <span className="w-[76px] shrink-0 text-sm text-text-secondary">{label}</span>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

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
  const pricing = getModelCost(spec.preset.model, modelPricing);
  const lookupEndpoint = resolveModelCatalogKey(spec.preset.endpoint, tokenConfig);
  const contextTokens = tokenConfig?.[lookupEndpoint]?.[spec.preset.model ?? '']?.context;

  const hasDetails =
    details != null || pricing != null || (contextTokens != null && contextTokens > 0);
  if (!hasDetails) {
    return <>{children}</>;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent
          // Deloitte Custom Change: Figma calls for a white card, not the default grey secondary surface.
          className="w-[26rem] bg-white p-0 dark:bg-surface-secondary"
          role="region"
          aria-label={localize('com_ui_model_details')}
          // Deloitte Custom Change: dock to the right of the model list, top-aligned with the row.
          side="right"
          align="start"
        >
          {/* Deloitte Custom Change: header matches Figma's stacked provider/model name, not a single line. */}
          <div className="flex flex-col gap-2 border-b border-border-light p-6">
            <div className="flex items-center gap-2">
              <SpecIcon
                currentSpec={spec}
                endpointsConfig={endpointsConfig}
                agentAvatarURL={agentAvatarURL}
                size={32}
              />
              <div className="flex min-w-0 flex-col">
                {spec.group && (
                  <span className="truncate text-xs text-text-secondary">{spec.group}</span>
                )}
                <span className="truncate text-base font-semibold text-text-primary">
                  {spec.label}
                </span>
              </div>
            </div>
            <SpecDescription description={spec.description} />
          </div>
          <div className="flex flex-col gap-4 p-6">
            {details?.speed != null && (
              <DetailRow label={localize('com_ui_model_details_speed')}>
                <RatingMeter value={details.speed} />
              </DetailRow>
            )}
            {details?.intelligence != null && (
              <DetailRow label={localize('com_ui_model_details_intelligence')}>
                <RatingMeter value={details.intelligence} />
              </DetailRow>
            )}
            {pricing && (
              <DetailRow label={localize('com_ui_model_details_cost')}>
                <RatingMeter value={pricing.tier} />
                <p className="text-sm text-text-secondary">
                  {localize('com_ui_model_details_cost_input', {
                    0: formatPrice(pricing.inputPer1M),
                  })}
                </p>
                <p className="text-sm text-text-secondary">
                  {localize('com_ui_model_details_cost_output', {
                    0: formatPrice(pricing.outputPer1M),
                  })}
                </p>
              </DetailRow>
            )}
            {contextTokens != null && contextTokens > 0 && (
              <DetailRow label={localize('com_ui_model_details_context')}>
                <span className="text-sm text-text-primary">{formatTokens(contextTokens)}</span>
              </DetailRow>
            )}
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
