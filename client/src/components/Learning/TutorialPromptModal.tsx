import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import { GraduationCap } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { Button, useMediaQuery } from '@librechat/client';
import { TUTORIAL_PROMPT_DELAY_MS, SIDEBAR_TRANSITION_SYNC_MS } from './timing';
import useTutorialPrompt from '~/hooks/Learning/useTutorialPrompt';
import { useLearningTour } from './LearningTourContext';
import { useLocalize } from '~/hooks';
import store from '~/store';

/** Measure the sidebar's current pixel width from the DOM. */
function getSidebarWidth(): number {
  const el = document.querySelector<HTMLElement>('[data-sidebar-container]');
  return el ? el.getBoundingClientRect().width : 52;
}

/**
 * Mounted once in `Root`. On first login (after any terms modal is dismissed),
 * renders with a short delay:
 *   - a bg-black/60 backdrop rendered inside Popover.Portal so it escapes the
 *     `relative z-0` stacking context in Root.tsx and covers the full viewport
 *   - a Radix Popover bubble anchored to #nav-panel-learning via
 *     virtualRef, appearing to the right of the Learning Hub icon with a
 *     pointed top-left corner aimed at the icon
 *
 * Ordering: Load page → disclaimer popup → close popup → chat UI fully loads
 * (endpoints + models queries resolve) → TUTORIAL_PROMPT_DELAY_MS delay → this
 * bubble appears.
 *
 * Dismissal:
 *   - "Start Tour"  → starts the guided tour and marks tutorialPromptSeen
 *   - "Skip"        → marks tutorialPromptSeen only
 *   - backdrop click → marks tutorialPromptSeen (B2)
 *   - clicking the Learning Hub icon while bubble is showing → marks seen (D1)
 *
 * Per-user persistence: markPromptSeen() calls POST /api/user/tutorial which
 * sets tutorialPromptSeen=true on the MongoDB user document — survives across
 * devices and sessions.
 */

interface TutorialPromptModalProps {
  /** Pass `showTerms` from Root so the tutorial bubble waits until terms are dismissed. */
  termsVisible?: boolean;
  /** Pass true once the main chat UI has finished loading (endpoints + models resolved).
   *  Prevents the bubble from appearing while the chat window is still rendering. */
  chatReady?: boolean;
}

export default function TutorialPromptModal({
  termsVisible = false,
  chatReady = false,
}: TutorialPromptModalProps) {
  const localize = useLocalize();
  const { startGettingStartedTour } = useLearningTour();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { shouldShowPrompt, markPromptSeen } = useTutorialPrompt();
  const [sidebarExpanded, setSidebarExpanded] = useRecoilState(store.sidebarExpanded);

  // readyToShow gates the delay: starts false, flips true TUTORIAL_PROMPT_DELAY_MS
  // after termsVisible goes from true→false (or immediately if terms never showed).
  const [readyToShow, setReadyToShow] = useState(false);
  const [mobilePromptReady, setMobilePromptReady] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(52);
  const titleId = useId();

  useEffect(() => {
    // Hold the bubble back while terms are visible OR while the chat UI hasn't
    // finished loading yet (endpoints + models not resolved). This prevents the
    // bubble appearing during the spinner phase and then disappearing when the
    // chat window mounts.
    if (termsVisible || !chatReady) {
      setReadyToShow(false);
      return;
    }
    // Terms are gone and chat is ready — start the delay timer.
    const timer = window.setTimeout(() => setReadyToShow(true), TUTORIAL_PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [termsVisible, chatReady]);

  const isVisible = shouldShowPrompt && readyToShow;
  const canRenderPrompt = isVisible && (!isSmallScreen || mobilePromptReady);

  useEffect(() => {
    if (!isVisible) {
      setMobilePromptReady(false);
      return;
    }
    if (!isSmallScreen) {
      setMobilePromptReady(true);
      return;
    }
    if (!sidebarExpanded) {
      setSidebarExpanded(true);
    }
    const timer = window.setTimeout(() => setMobilePromptReady(true), SIDEBAR_TRANSITION_SYNC_MS);
    return () => window.clearTimeout(timer);
  }, [isVisible, isSmallScreen, sidebarExpanded, setSidebarExpanded]);

  // iconRect holds the Learning Hub icon's bounding rect so we can carve a
  // clip-path hole in the sidebar overlay directly over it (Decision D1 fix:
  // the single full-sidebar overlay previously intercepted every click on the
  // icon before it reached the icon's own button/listener).
  const [iconRect, setIconRect] = useState<DOMRect | null>(null);

  // Consolidated measurement: sidebar width + icon rect, re-run on visibility/
  // sidebar-expand changes AND on window resize, so the clip-path hole can't
  // drift after a resize or zoom while the prompt is visible.
  useEffect(() => {
    if (!canRenderPrompt) {
      return;
    }
    const measure = () => {
      setSidebarWidth(getSidebarWidth());
      const el = document.getElementById('nav-panel-learning');
      setIconRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [canRenderPrompt, sidebarExpanded]);

  // virtualRef lets Radix Popover position the bubble relative to the learning
  // nav icon without wrapping or modifying ExpandedPanel at all.
  const virtualRef = useRef<{ getBoundingClientRect: () => DOMRect } | null>(null);

  // useLayoutEffect (not useEffect) so the ref is populated synchronously
  // before Radix's own anchor-measurement layout effect runs on this same
  // mount pass — otherwise the first position calculation sees a null anchor.
  useLayoutEffect(() => {
    if (!canRenderPrompt) {
      return;
    }
    const el = document.getElementById('nav-panel-learning');
    if (el) {
      virtualRef.current = el;
    }
  }, [canRenderPrompt]);

  // Decision D1: clicking the Learning Hub icon while the bubble is showing
  // counts as accepting — mark seen so the bubble doesn't reappear.
  useEffect(() => {
    if (!canRenderPrompt) {
      return;
    }
    const el = document.getElementById('nav-panel-learning');
    if (!el) {
      return;
    }
    const handleIconClick = () => markPromptSeen();
    el.addEventListener('click', handleIconClick, { once: true });
    return () => el.removeEventListener('click', handleIconClick);
  }, [canRenderPrompt, markPromptSeen]);

  const handleAccept = () => {
    startGettingStartedTour();
  };

  if (!canRenderPrompt) {
    return null;
  }

  return (
    <Popover.Root
      open={isVisible}
      onOpenChange={(open) => {
        // Covers Radix's own dismiss paths (Escape, its own outside-click
        // detection) with the same effect as the manual backdrop/button
        // dismiss handlers below.
        if (!open) {
          markPromptSeen();
        }
      }}
    >
      {/* virtualRef positions the bubble without touching ExpandedPanel */}
      <Popover.Anchor virtualRef={virtualRef} />

      <Popover.Portal>
        <>
          {/* Two-panel backdrop: the sidebar gets a light 10% dim so the
              Learning Hub icon remains the clear visual focal point, while the
              main content area gets a heavier 60% dim to draw attention to the
              bubble. Both are rendered inside Portal so they escape Root's
              `relative z-0` stacking context.
              Decision B2: clicking either panel marks seen and dismisses. */}

          {/* Sidebar overlay — light dim (10%) so the nav icons stay visible.
              When iconRect is known and valid, clip-path carves a rectangular
              hole exactly over the Learning Hub icon so clicks reach the icon's
              own button (Decision D1) rather than being captured here. The hole
              uses a keyhole polygon (outer rect wound CW, inner rect wound CCW
              connected via a shared edge point) — standard CSS cutout technique.
              Falls back to a solid overlay (no hole, prior behaviour) if the
              icon hasn't been measured yet or its rect is degenerate/zero-size. */}
          <div
            className="fixed inset-y-0 left-0 bg-black/10"
            style={{
              zIndex: 200,
              width: sidebarWidth,
              clipPath:
                iconRect != null && iconRect.width > 0 && iconRect.height > 0
                  ? [
                      'polygon(',
                      // Outer rect (clockwise) — covers the whole sidebar
                      '0px 0px,',
                      `${sidebarWidth}px 0px,`,
                      `${sidebarWidth}px 100vh,`,
                      '0px 100vh,',
                      // Return to top-left to close the outer shape, then
                      // immediately start the inner cutout (counter-clockwise)
                      '0px 0px,',
                      // Inner rect wound COUNTER-CLOCKWISE (top-left → bottom-left
                      // → bottom-right → top-right → top-left), opposite to the
                      // outer rect's clockwise direction. Under the nonzero fill
                      // rule, opposite winding cancels and produces a real hole.
                      // Same direction as the outer rect would NOT create a hole.
                      `${iconRect.left}px ${iconRect.top}px,`,
                      `${iconRect.left}px ${iconRect.top + iconRect.height}px,`,
                      `${iconRect.left + iconRect.width}px ${iconRect.top + iconRect.height}px,`,
                      `${iconRect.left + iconRect.width}px ${iconRect.top}px,`,
                      `${iconRect.left}px ${iconRect.top}px`,
                      ')',
                    ].join(' ')
                  : undefined,
            }}
            onClick={markPromptSeen}
            aria-hidden="true"
          />

          {/* Main content overlay — heavier dim (60%) */}
          <div
            className="fixed inset-y-0 right-0 bg-black/60"
            style={{ zIndex: 200, left: sidebarWidth }}
            onClick={markPromptSeen}
            aria-hidden="true"
          />

          <Popover.Content
            side="right"
            sideOffset={8}
            align="start"
            avoidCollisions
            aria-labelledby={titleId}
            onOpenAutoFocus={(e) => e.preventDefault()}
            style={{ zIndex: 300, borderRadius: '0 12px 12px 12px' }}
            className="w-64 border border-border-medium bg-surface-primary p-4 shadow-lg outline-none"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-tertiary">
                  <GraduationCap className="size-4 text-text-secondary" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    {localize('com_ui_learning_hub')}
                  </p>
                  <p id={titleId} className="text-sm font-semibold text-text-primary">
                    {localize('com_learning_prompt_title')}
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-text-secondary">
                {localize('com_learning_prompt_body')}
              </p>

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="submit"
                  size="sm"
                  onClick={handleAccept}
                  className="flex-1"
                >
                  {localize('com_learning_prompt_accept')}
                </Button>
                <button
                  type="button"
                  onClick={markPromptSeen}
                  className="text-xs text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline"
                >
                  {localize('com_learning_prompt_decline')}
                </button>
              </div>
            </div>
          </Popover.Content>
        </>
      </Popover.Portal>
    </Popover.Root>
  );
}
