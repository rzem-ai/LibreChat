// The chevron must sit exactly half-outside the card's edge, so the offset
// is derived from its own size rather than a separate hardcoded value.
const CHEVRON_SIZE_PX = 12;
const CHEVRON_OFFSET = `${-CHEVRON_SIZE_PX / 2}px`;

/**
 * Attaches a small diamond chevron to the card, on whichever edge faces the
 * target — reusing driver.js's own (hidden) arrow position/side rather than
 * guessing. That position is set only after `onPopoverRender` returns, hence
 * the microtask.
 */
export function attachCardChevron(container: HTMLElement, arrow: HTMLElement) {
  queueMicrotask(() => {
    const side = (['top', 'right', 'bottom', 'left'] as const).find((value) =>
      arrow.classList.contains(`driver-popover-arrow-side-${value}`),
    );
    if (!side) {
      return;
    }
    const chevron = document.createElement('div');
    chevron.className = 'absolute rotate-45 bg-surface-primary';
    chevron.style.width = `${CHEVRON_SIZE_PX}px`;
    chevron.style.height = `${CHEVRON_SIZE_PX}px`;
    if (side === 'left' || side === 'right') {
      chevron.style.top = arrow.style.top;
      chevron.style[side === 'left' ? 'right' : 'left'] = CHEVRON_OFFSET;
    } else {
      chevron.style.left = arrow.style.left;
      chevron.style[side === 'top' ? 'bottom' : 'top'] = CHEVRON_OFFSET;
    }
    container.style.position = 'relative';
    container.insertBefore(chevron, container.firstChild);
  });
}
