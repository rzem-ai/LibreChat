export function isUnavailableElement(el: HTMLElement): boolean {
  return (
    el.getAttribute('aria-disabled') === 'true' ||
    (el instanceof HTMLButtonElement && el.disabled) ||
    (el instanceof HTMLInputElement && el.disabled)
  );
}

/** Whether at least one element matching `selector` exists and is available (see `isUnavailableElement`). */
export function hasAvailableTarget(selector: string): boolean {
  try {
    const targets = document.querySelectorAll<HTMLElement>(selector);
    return Array.from(targets).some((target) => !isUnavailableElement(target));
  } catch {
    return false;
  }
}
