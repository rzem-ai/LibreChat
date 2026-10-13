import { Check } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '../HoverCard';
import { RatingMeter } from './RatingMeter';
import { cn } from '~/utils';

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

export interface ModelInfoTooltipCost {
  tier: number;
  inputText: string;
  outputText: string;
}

export interface ModelInfoTooltipLabels {
  ariaLabel: string;
  speed: string;
  intelligence: string;
  cost: string;
  context: string;
  supports: string;
}

export interface ModelInfoTooltipProps {
  /** Pre-rendered provider/spec icon — callers own icon resolution (avatars, entity marks, etc). */
  icon: ReactNode;
  group?: string;
  label: string;
  /** Pre-rendered, pre-sanitized description — callers own HTML sanitization. */
  description?: ReactNode;
  speed?: number;
  intelligence?: number;
  cost?: ModelInfoTooltipCost;
  /** Pre-formatted context window (e.g. "128K") — callers own number formatting. */
  contextLabel?: string;
  /** Pre-localized capability labels (e.g. web search, image generation). */
  supports?: string[];
  labels: ModelInfoTooltipLabels;
  children: ReactNode;
}

// Deloitte Custom Change: new file — hover tooltip surfacing various model details for a
// model spec (Figma "AI Model Tooltip"), reusing existing primitives (HoverCard, RatingMeter).
// Purely presentational: callers resolve icons, sanitize descriptions, format numbers, and
// localize strings, then pass the results in as props.
export function ModelInfoTooltip({
  icon,
  group,
  label,
  description,
  speed,
  intelligence,
  cost,
  contextLabel,
  supports = [],
  labels,
  children,
}: ModelInfoTooltipProps): ReactElement {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent
          // Deloitte Custom Change: Figma calls for a white card, not the default grey secondary surface.
          className="w-[26rem] bg-white p-0 dark:bg-surface-secondary"
          role="region"
          aria-label={labels.ariaLabel}
          // Deloitte Custom Change: dock to the right of the model list, top-aligned with the row.
          side="right"
          align="start"
        >
          {/* Deloitte Custom Change: header matches Figma's stacked provider/model name, not a single line. */}
          <div className="flex flex-col gap-1 border-b border-border-light p-6">
            <div className="flex items-center gap-2">
              {icon}
              <div className="flex min-w-0 flex-col">
                {group && <span className="truncate text-xs text-text-secondary">{group}</span>}
                <span className="truncate text-base font-semibold text-text-primary">{label}</span>
              </div>
            </div>
            {/* Deloitte Custom Change: scoped to the description only, so the icon's provider
                logo (which uses currentColor) isn't recolored by inheritance. */}
            <div className="text-text-secondary-alt">{description}</div>
          </div>
          <div className="flex flex-col gap-4 p-6">
            {speed != null && (
              <DetailRow label={labels.speed}>
                <RatingMeter value={speed} />
              </DetailRow>
            )}
            {intelligence != null && (
              <DetailRow label={labels.intelligence}>
                <RatingMeter value={intelligence} />
              </DetailRow>
            )}
            {cost && (
              <DetailRow label={labels.cost} align="start">
                {/* Deloitte Custom Change: h-5 matches the label's text-sm line height, so the
                    rating bar's own row centers vertically against the label instead of sitting
                    at the top of it; the price lines below are unaffected. */}
                <div className="flex h-5 items-center">
                  <RatingMeter value={cost.tier} />
                </div>
                {/* Deloitte Custom Change: -mt-1 pulls the price line up slightly closer to the
                    rating bar above it; text-secondary-alt + leading-5 match the Figma spec's
                    muted-foreground color and text-sm line height exactly. */}
                <p className="-mt-1 text-sm leading-5 text-text-secondary-alt">{cost.inputText}</p>
                <p className="-mt-1 text-sm leading-5 text-text-secondary-alt">{cost.outputText}</p>
              </DetailRow>
            )}
            {contextLabel && (
              <DetailRow label={labels.context} align="start">
                <span className="text-sm text-text-secondary-alt">{contextLabel}</span>
              </DetailRow>
            )}
            {supports.length > 0 && (
              <DetailRow label={labels.supports} align="start">
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
