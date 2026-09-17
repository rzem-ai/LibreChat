import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import { Library } from 'lucide-react';
import { Button, useMediaQuery } from '@librechat/client';
import * as Popover from '@radix-ui/react-popover';
import { useLearningTour } from './LearningTourContext';
import useTutorialPrompt from '~/hooks/Learning/useTutorialPrompt';
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
 *   - a Radix Popover bubble anchored to [data-testid="nav-panel-learning"] via
 *     virtualRef, appearing to the right of the Learning Hub icon with a
 *     pointed top-left corner aimed at the icon
 *
 * Ordering: Load page → disclaimer popup → close popup → chat UI fully loads
 * (endpoints + models queries resolve) → 800ms delay → this bubble appears.
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

/** Delay (ms) after the terms modal closes before the bubble appears. */
const TUTORIAL_PROMPT_DELAY_MS = 800;
const MOBILE_SIDEBAR_TRANSITION_MS = 300;

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
    const timer = window.setTimeout(() => setMobilePromptReady(true), MOBILE_SIDEBAR_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [isVisible, isSmallScreen, sidebarExpanded, setSidebarExpanded]);

  // Measure sidebar width when the bubble becomes visible so the two-panel
  // backdrop splits correctly at the sidebar/content boundary.
  useEffect(() => {
    if (canRenderPrompt) {
      setSidebarWidth(getSidebarWidth());
    }
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
    const el = document.querySelector<HTMLElement>('[data-testid="nav-panel-learning"]');
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
    const el = document.querySelector<HTMLElement>('[data-testid="nav-panel-learning"]');
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

          {/* Sidebar overlay — light dim (10%) so the nav icons stay visible */}
          <div
            className="fixed inset-y-0 left-0 bg-black/10"
            style={{ zIndex: 200, width: sidebarWidth }}
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
            // Decision C: pointed top-left corner aimed at the icon; all other
            // corners rounded — achieved purely with border-radius, no extra DOM.
            style={{ zIndex: 300, borderRadius: '0 12px 12px 12px' }}
            className="w-64 border border-border-medium bg-surface-primary p-4 shadow-lg outline-none"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-tertiary">
                  <Library className="size-4 text-text-secondary" aria-hidden="true" />
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
                  size="sm"
                  onClick={handleAccept}
                  className="flex-1 bg-surface-submit text-white hover:bg-surface-submit-hover"
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
