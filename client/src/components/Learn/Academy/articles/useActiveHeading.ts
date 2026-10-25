import { useEffect, useRef, useState } from 'react';

/** Marks a heading active once it crosses into the top 30% of the viewport. */
const OBSERVER_MARGIN = '0px 0px -70% 0px';

/**
 * Tracks which article section is current for the "On this page" list. Falls back to the first
 * heading, and keeps the last active heading while none is intersecting.
 */
export default function useActiveHeading(
  ids: string[],
): [string | undefined, (id: string) => void] {
  const [activeId, setActiveId] = useState<string | undefined>(ids[0]);
  const intersecting = useRef(new Set<string>());
  const key = ids.join('|');

  useEffect(() => {
    const headingIds = key ? key.split('|') : [];
    setActiveId(headingIds[0]);
    intersecting.current.clear();
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) =>
          isIntersecting
            ? intersecting.current.add(target.id)
            : intersecting.current.delete(target.id),
        );
        const current = headingIds.find((id) => intersecting.current.has(id));
        if (current) {
          setActiveId(current);
        }
      },
      { rootMargin: OBSERVER_MARGIN },
    );
    headingIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });
    return () => observer.disconnect();
  }, [key]);

  return [activeId, setActiveId];
}
