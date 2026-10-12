/**
 * The sidebar's real CSS transition duration (see `TRANSITION_MS` in
 * `client/src/components/UnifiedSidebar/UnifiedSidebar.tsx`). Used to delay
 * rendering the tutorial prompt bubble and starting the tour on mobile until
 * the sidebar has visually finished expanding/collapsing. Keep this in sync
 * with `UnifiedSidebar.tsx` if that value ever changes.
 */
export const SIDEBAR_TRANSITION_SYNC_MS = 300;

/** Discretionary delay (ms) after the terms modal closes before the tutorial
 *  prompt bubble appears — not tied to any animation, just pacing. */
export const TUTORIAL_PROMPT_DELAY_MS = 400;

/** Discretionary delay (ms) before driving the tour on desktop, giving the
 *  route navigation + panel switch time to mount before `waitForElement`
 *  kicks in on the first step. */
export const DESKTOP_START_DELAY_MS = 200;
