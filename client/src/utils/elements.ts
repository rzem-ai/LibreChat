export function isUnavailableElement(el: HTMLElement): boolean {
  return (
    el.getAttribute('aria-disabled') === 'true' ||
    (el instanceof HTMLButtonElement && el.disabled) ||
    (el instanceof HTMLInputElement && el.disabled)
  );
}
