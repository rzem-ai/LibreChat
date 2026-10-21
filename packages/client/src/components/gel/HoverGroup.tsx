import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FocusEvent, PointerEvent, ReactElement, ReactNode } from 'react';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '../HoverCard';
import { cn } from '~/utils';

/** Renders the card body; receives the card's id so it can be referenced via `aria-describedby`. */
export type HoverCardRender = (cardId: string) => ReactNode;

interface HoverCardGroupContextValue {
  show: (render: HoverCardRender, targetId: string) => void;
  hide: () => void;
  /** Id of the card region while it is open, else undefined. */
  cardId?: string;
  /** Id of the target whose content the card currently shows. */
  activeTargetId?: string;
}

interface ActiveContent {
  render: HoverCardRender;
  targetId: string;
}

const HoverCardGroupContext = createContext<HoverCardGroupContextValue | null>(null);

// Deloitte Custom Change: delay before closing once the pointer/focus leaves a row, long
// enough for the pointer to travel into the card itself (cancelled by re-entering the card)
// or into an adjacent row (cancelled by that row's own `show`) without the card flashing
// closed in between.
const HOVER_CLOSE_DELAY_MS = 50;

/**
 * Deloitte Custom Change: one HoverCard shared by every row in a list, anchored to the whole
 * list rather than to whichever row is hovered (Popper measures `children`'s combined bounding
 * box, which spans every row). Previously each row owned its own HoverCard, so the card's
 * screen position jumped to match that row's position and — worse, near the edges of a
 * scrollable menu — Radix's own collision handling could throw it somewhere else again.
 * Rows call `useHoverCardGroup().show/hide` (via `HoverCardTarget`) instead of mounting their
 * own HoverCardTrigger, so the content swaps in place without the card ever moving or
 * re-running its enter/exit animation between rows. Shared by the model and MCP pickers.
 */
export function HoverCardGroup({
  children,
  contentClassName,
}: {
  children: ReactNode;
  contentClassName?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  // Deliberately not cleared on hide(): the close animation should fade out whatever was last
  // shown, not go blank the instant the close timer fires.
  const [active, setActive] = useState<ActiveContent | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const cardId = useId();

  useEffect(() => () => clearTimeout(closeTimeoutRef.current), []);

  const show = useCallback((render: HoverCardRender, targetId: string) => {
    clearTimeout(closeTimeoutRef.current);
    setActive({ render, targetId });
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
    <HoverCardGroupContext.Provider value={contextValue}>
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
            className={cn(
              'w-[26rem] bg-surface-primary p-0 dark:bg-surface-secondary',
              contentClassName,
            )}
            // Deloitte Custom Change: dock to the right of the list, top-aligned with it.
            side="right"
            align="start"
            collisionPadding={4}
            // Deloitte Custom Change: re-entering the card itself (e.g. to read a long
            // description) keeps it open the same way re-entering a row does.
            onPointerEnter={() => active && show(active.render, active.targetId)}
            onPointerLeave={hide}
          >
            {active?.render(cardId)}
          </HoverCardContent>
        </HoverCardPortal>
      </HoverCard>
    </HoverCardGroupContext.Provider>
  );
}

export function useHoverCardGroup(): HoverCardGroupContextValue {
  const context = useContext(HoverCardGroupContext);
  if (!context) {
    throw new Error('useHoverCardGroup must be used within a HoverCardGroup');
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

// Deloitte Custom Change: row-level counterpart to HoverCardGroup — wires a single child into
// the group's shared hover state instead of mounting its own HoverCard. Renders `children`
// as-is (no extra DOM node).
export function HoverCardTarget({
  render,
  children,
}: {
  render: HoverCardRender | null;
  children: ReactElement<HoverableElementProps>;
}): ReactElement {
  const { show, hide, cardId, activeTargetId } = useHoverCardGroup();
  const targetId = useId();
  if (!render) {
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
    onPointerEnter: composeHandler(() => show(render, targetId), existing.onPointerEnter),
    onPointerLeave: composeHandler(hide, existing.onPointerLeave),
    onFocus: composeHandler(() => show(render, targetId), existing.onFocus),
    onBlur: composeHandler(hide, existing.onBlur),
    'aria-describedby': describedBy || undefined,
  });
}
