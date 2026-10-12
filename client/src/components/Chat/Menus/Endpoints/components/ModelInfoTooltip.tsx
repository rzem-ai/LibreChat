// Deloitte Custom Change: new file — hover tooltip surfacing various model details
// for a model spec, reusing existing primitives (HoverCard, RatingMeter).
import { Check } from 'lucide-react';
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
import { formatTokens, cn } from '~/utils';
import { useLocalize } from '~/hooks';
import SpecIcon from './SpecIcon';

// Deloitte Custom Change: fixed-width label + flexible content row, matching the Figma
// "AI Model Tooltip" row layout (label column, then meter/value column). Single-value rows
// (Speed, Intelligence) center against their rating meter; multi-line rows (Cost, Context,
// Supports) align to the top of their label.
function DetailRow({
  label,
  align = 'center',
  children,
}: {
  label: string;
  align?: 'center' | 'start';
  children: ReactNode;
}) {
  return (
    <div className={cn('flex gap-8', align === 'center' ? 'items-center' : 'items-start')}>
      <span className="w-[76px] shrink-0 text-sm text-text-secondary-alt">{label}</span>
      <div
        className={cn(
          'flex flex-1 gap-2',
          // Deloitte Custom Change: single-value rows (Speed, Intelligence) give their rating
          // bar the same h-5 box as the label's text-sm line height, so the two are the same
          // height rather than the bar being vertically centered within a taller row.
          align === 'center' ? 'h-5 items-center' : 'flex-col',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function SupportRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1">
      <Check className="size-4 shrink-0 text-text-secondary-alt" aria-hidden="true" />
      <span className="text-sm text-text-secondary-alt">{label}</span>
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
            {/* Deloitte Custom Change: scoped to the description only, so SpecIcon's provider
                logo (which uses currentColor) isn't recolored by inheritance. */}
            <div className="text-text-secondary-alt">
              <SpecDescription description={spec.description} />
            </div>
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
              <DetailRow label={localize('com_ui_model_details_cost')} align="start">
                {/* Deloitte Custom Change: h-5 matches the label's text-sm line height, so the
                    rating bar's own row centers vertically against the label instead of sitting
                    at the top of it; the price lines below are unaffected. */}
                <div className="flex h-5 items-center">
                  <RatingMeter value={pricing.tier} />
                </div>
                {/* Deloitte Custom Change: -mt-1 pulls the price line up slightly closer to the
                    rating bar above it; text-secondary-alt + leading-5 match the Figma spec's
                    muted-foreground color and text-sm line height exactly. */}
                <p className="-mt-1 text-sm leading-5 text-text-secondary-alt">
                  {localize('com_ui_model_details_cost_input', {
                    0: formatPrice(pricing.inputPer1M),
                  })}
                </p>
                <p className="-mt-1 text-sm leading-5 text-text-secondary-alt">
                  {localize('com_ui_model_details_cost_output', {
                    0: formatPrice(pricing.outputPer1M),
                  })}
                </p>
              </DetailRow>
            )}
            {contextTokens != null && contextTokens > 0 && (
              <DetailRow label={localize('com_ui_model_details_context')} align="start">
                <span className="text-sm text-text-secondary-alt">
                  {formatTokens(contextTokens)}
                </span>
              </DetailRow>
            )}
            {supports.length > 0 && (
              <DetailRow label={localize('com_ui_model_details_supports')} align="start">
                {supports.map((supportLabel) => (
                  <SupportRow key={supportLabel} label={supportLabel} />
                ))}
              </DetailRow>
            )}
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
