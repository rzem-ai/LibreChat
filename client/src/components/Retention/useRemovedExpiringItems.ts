import { useCallback, useState } from 'react';
import type { ExpiringItemType } from './types';

const STORAGE_KEY = 'expiringPopupRemovedIds';

function itemKey(type: ExpiringItemType, id: string): string {
  return `${type}:${id}`;
}

function readRemovedIds(): Set<string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

export type RemovedExpiringItems = {
  isRemoved: (type: ExpiringItemType, id: string) => boolean;
  markRemoved: (type: ExpiringItemType, id: string) => void;
};

/**
 * Tracks ids the user permanently removed (via the confirm-removal card), so
 * they're excluded from the stack forever — independent of the daily
 * show/gate, which only controls how often the stack is re-offered.
 */
export function useRemovedExpiringItems(): RemovedExpiringItems {
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => readRemovedIds());

  const isRemoved = useCallback(
    (type: ExpiringItemType, id: string) => removedIds.has(itemKey(type, id)),
    [removedIds],
  );

  const markRemoved = useCallback((type: ExpiringItemType, id: string) => {
    setRemovedIds((current) => {
      const next = new Set(current);
      next.add(itemKey(type, id));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  return { isRemoved, markRemoved };
}
