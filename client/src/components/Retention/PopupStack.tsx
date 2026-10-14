import { useEffect, useRef, useState } from 'react';
import { VisuallyHidden } from '@ariakit/react';
import { OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import type { ExpiringItem } from './types';
import { useRemovedExpiringItems } from './useRemovedExpiringItems';
import { useDailyPopupGate } from './useDailyPopupGate';
import { useExpiringItems } from './useExpiringItems';
import { useLocalize } from '~/hooks';
import PopupCard from './PopupCard';

/**
 * Top-centered modal listing every agent/skill/file expiring soon, shown at
 * most once per local calendar day (see useDailyPopupGate). The underlying
 * expiring-soon queries keep polling in the background, but the stack is
 * snapshotted once on open so a mid-session refetch cannot reorder or add to
 * a stack the user is already acting on.
 *
 * The daily gate is only persisted once every item in the stack has been
 * renewed or permanently removed — not the moment the stack first appears —
 * so a page refresh before the user finishes acknowledging everything shows
 * the remaining items again instead of silently suppressing them for the
 * day. Hitting a card's `x` doesn't dismiss it outright: it asks for
 * confirmation (renew now, or remove permanently via useRemovedExpiringItems,
 * which survives every future daily-gate reset).
 */
export default function PopupStack() {
  const localize = useLocalize();
  const { items, isReady } = useExpiringItems();
  const { alreadyShownToday, markShownToday } = useDailyPopupGate();
  const { isRemoved, markRemoved } = useRemovedExpiringItems();
  const [stack, setStack] = useState<ExpiringItem[] | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || !isReady || alreadyShownToday || items.length === 0) {
      return;
    }
    const visibleItems = items.filter((item) => !isRemoved(item.type, item.id));
    if (visibleItems.length === 0) {
      return;
    }
    initializedRef.current = true;
    setStack(visibleItems);
  }, [alreadyShownToday, isReady, items, isRemoved]);

  useEffect(() => {
    if (stack != null && stack.length === 0) {
      markShownToday();
    }
  }, [stack, markShownToday]);

  if (!stack || stack.length === 0) {
    return null;
  }

  const removeItem = (type: ExpiringItem['type'], id: string) => {
    setStack((current) => (current ?? []).filter((item) => item.type !== type || item.id !== id));
  };

  return (
    <OGDialog open>
      <OGDialogContent
        showCloseButton={false}
        overlayClassName="bg-black/15"
        className="top-16 max-w-3xl translate-y-0 gap-0 rounded-none bg-transparent p-0 shadow-none"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <OGDialogTitle>
          <VisuallyHidden>{localize('com_ui_expiring_items_title')}</VisuallyHidden>
        </OGDialogTitle>
        <div className="flex flex-col gap-2">
          {stack.map((item) => (
            <PopupCard
              key={`${item.type}-${item.id}`}
              item={item}
              onRenewed={() => removeItem(item.type, item.id)}
              onRemoveForever={() => {
                markRemoved(item.type, item.id);
                removeItem(item.type, item.id);
              }}
            />
          ))}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
