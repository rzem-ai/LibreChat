import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import type { HoverCardRender } from './HoverGroup';
import { HoverCardGroup, HoverCardTarget, useHoverCardGroup } from './HoverGroup';
import { RatingMeter } from './RatingMeter';
import { Tag } from '../Tag';
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
  /** Whether this model's tier is configured to show the "High Cost" callout (see `customDeloitteFeatureFlags.highCostAlertTiers`). */
  isHighCost?: boolean;
  inputText: string;
  outputText: string;
}

export interface ModelInfoTooltipLabels {
  ariaLabel: string;
  speed: string;
  intelligence: string;
  cost: string;
  highCost: string;
  context: string;
  supports: string;
  /** Builds a rating meter's localized accessible name, e.g. "3 of 5". */
  ratingValue: (value: number, max: number) => string;
}

export interface ModelInfoTooltipContent {
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
}

// Deloitte Custom Change: pure render of the card body, split out of ModelInfoTooltip so it
// has no opinion on how/where it's positioned — ModelInfoHoverGroup is what anchors and
// animates it. Kept separately testable: no HoverCard, no hover state, just props in, markup
// out (Figma node 855:37722).
export function ModelInfoTooltipCard({
  id,
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
}: ModelInfoTooltipContent & { id?: string }): ReactElement {
  return (
    <div id={id} role="region" aria-label={labels.ariaLabel}>
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
            <RatingMeter value={speed} ariaLabel={labels.ratingValue(speed, 5)} />
          </DetailRow>
        )}
        {intelligence != null && (
          <DetailRow label={labels.intelligence}>
            <RatingMeter value={intelligence} ariaLabel={labels.ratingValue(intelligence, 5)} />
          </DetailRow>
        )}
        {cost && (
          <DetailRow label={labels.cost} align="start">
            {/* Deloitte Custom Change: h-5 matches the label's text-sm line height, so the
                rating bar's own row centers vertically against the label instead of sitting
                at the top of it; the price lines below are unaffected. */}
            <div className="flex h-5 items-center">
              <RatingMeter value={cost.tier} ariaLabel={labels.ratingValue(cost.tier, 5)} />
            </div>
            {cost.isHighCost === true && (
              <Tag
                label={labels.highCost}
                className="w-fit self-start border border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                labelClassName="!ml-0 px-1.5 py-0.5 text-[12px] font-medium tracking-wide whitespace-nowrap"
              />
            )}
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
    </div>
  );
}

const MODEL_INFO_CARD_CLASS = 'rounded-xl border-border bg-card text-card-foreground shadow-md';

// Deloitte Custom Change: model-specific bindings over the shared HoverCardGroup/HoverCardTarget.
export function ModelInfoHoverGroup({ children }: { children: ReactNode }): ReactElement {
  return <HoverCardGroup contentClassName={MODEL_INFO_CARD_CLASS}>{children}</HoverCardGroup>;
}

export function useModelInfoHover(): ReturnType<typeof useHoverCardGroup> {
  return useHoverCardGroup();
}

export function ModelInfoHoverTarget({
  content,
  children,
}: {
  content: ModelInfoTooltipContent | null;
  children: ReactElement;
}): ReactElement {
  const render = useMemo<HoverCardRender | null>(
    () => (content ? (cardId) => <ModelInfoTooltipCard id={cardId} {...content} /> : null),
    [content],
  );
  return <HoverCardTarget render={render}>{children}</HoverCardTarget>;
}
