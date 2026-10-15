import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check } from 'lucide-react';
import type { FocusEvent, PointerEvent, ReactElement, ReactNode } from 'react';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '../HoverCard';
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

interface ModelInfoHoverContextValue {
  show: (content: ModelInfoTooltipContent, targetId: string) => void;
  hide: () => void;
  /** Id of the card region while it is open, else undefined. */
  cardId?: string;
  /** Id of the target whose content the card currently shows. */
  activeTargetId?: string;
}

interface ActiveContent {
  content: ModelInfoTooltipContent;
  targetId: string;
}

const ModelInfoHoverContext = createContext<ModelInfoHoverContextValue | null>(null);

// Deloitte Custom Change: delay before closing once the pointer/focus leaves a row, long
// enough for the pointer to travel into the card itself (cancelled by re-entering the card)
// or into an adjacent row (cancelled by that row's own `show`) without the card flashing
// closed in between.
const HOVER_CLOSE_DELAY_MS = 50;

/**
 * Deloitte Custom Change: one HoverCard shared by every row in a model list, anchored to the
 * whole list rather than to whichever row is hovered (Popper measures `children`'s combined
 * bounding box, which spans every row). Previously each row owned its own HoverCard, so the
 * card's screen position jumped to match that row's position and — worse, near the edges of
 * the scrollable menu — Radix's own collision handling could throw it somewhere else again.
 * Rows now call `useModelInfoHover().show/hide` instead of each mounting their own
 * HoverCardTrigger (via `ModelInfoHoverTarget`), so the content swaps in place without the
 * card ever moving or re-running its enter/exit animation between rows.
 */
export function ModelInfoHoverGroup({ children }: { children: ReactNode }): ReactElement {
  const [open, setOpen] = useState(false);
  // Deliberately not cleared on hide(): the close animation should fade out whatever was last
  // shown, not go blank the instant the close timer fires.
  const [active, setActive] = useState<ActiveContent | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const cardId = useId();

  const show = useCallback((content: ModelInfoTooltipContent, targetId: string) => {
    clearTimeout(closeTimeoutRef.current);
    setActive({ content, targetId });
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(closeTimeoutRef.current);
    setOpen(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        dismiss();
      }
    },
    [dismiss],
  );

  const contextValue = useMemo(
    () => ({
      show,
      hide,
      cardId: open ? cardId : undefined,
      activeTargetId: open ? active?.targetId : undefined,
    }),
    [show, hide, open, cardId, active?.targetId],
  );

  return (
    <ModelInfoHoverContext.Provider value={contextValue}>
      {/* Deloitte Custom Change: openDelay 0 so the card shows the moment a row is hovered;
          only rows open the card via `show`; Radix's own close requests (Escape, outside
          dismissal) are honored, its open requests ignored. */}
      <HoverCard open={open} onOpenChange={handleOpenChange} openDelay={0}>
        <HoverCardTrigger asChild>
          {/* Deloitte Custom Change: this div — not any individual row — is the Popper anchor,
              so the card's position never depends on which row triggered it. */}
          <div className="flex w-full flex-col">{children}</div>
        </HoverCardTrigger>
        <HoverCardPortal>
          <HoverCardContent
            // Deloitte Custom Change: Figma calls for a white card, not the default grey secondary surface.
            className="w-[26rem] bg-surface-primary p-0 dark:bg-surface-secondary"
            // Deloitte Custom Change: dock to the right of the model list, top-aligned with it.
            side="right"
            align="start"
            // Deloitte Custom Change: re-entering the card itself (e.g. to read a long
            // description) keeps it open the same way re-entering a row does.
            onPointerEnter={() => active && show(active.content, active.targetId)}
            onPointerLeave={hide}
          >
            {active && <ModelInfoTooltipCard id={cardId} {...active.content} />}
          </HoverCardContent>
        </HoverCardPortal>
      </HoverCard>
    </ModelInfoHoverContext.Provider>
  );
}

export function useModelInfoHover(): ModelInfoHoverContextValue {
  const context = useContext(ModelInfoHoverContext);
  if (!context) {
    throw new Error('useModelInfoHover must be used within a ModelInfoHoverGroup');
  }
  return context;
}

function composeHandler<E>(ours: (event: E) => void, theirs?: (event: E) => void) {
  return (event: E) => {
    theirs?.(event);
    ours(event);
  };
}

interface HoverableElementProps {
  onPointerEnter?: (event: PointerEvent) => void;
  onPointerLeave?: (event: PointerEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  'aria-describedby'?: string;
}

// Deloitte Custom Change: row-level counterpart to ModelInfoHoverGroup — wires a single child
// into the group's shared hover state instead of mounting its own HoverCard. Renders
// `children` as-is (no extra DOM node) so it drops into the same spot the old
// per-row-HoverCardTrigger wrapper used to occupy.
export function ModelInfoHoverTarget({
  content,
  children,
}: {
  content: ModelInfoTooltipContent | null;
  children: ReactElement<HoverableElementProps>;
}): ReactElement {
  const { show, hide, cardId, activeTargetId } = useModelInfoHover();
  const targetId = useId();
  if (!content) {
    return children;
  }
  const existing = children.props;
  const describedBy = [
    existing['aria-describedby'],
    cardId && activeTargetId === targetId && cardId,
  ]
    .filter(Boolean)
    .join(' ');
  return cloneElement(children, {
    onPointerEnter: composeHandler(() => show(content, targetId), existing.onPointerEnter),
    onPointerLeave: composeHandler(hide, existing.onPointerLeave),
    onFocus: composeHandler(() => show(content, targetId), existing.onFocus),
    onBlur: composeHandler(hide, existing.onBlur),
    'aria-describedby': describedBy || undefined,
  });
}
