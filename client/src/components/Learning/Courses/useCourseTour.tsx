import { useCallback, useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Driver, DriveStep, PopoverDOM } from 'driver.js';
import type { TourStep } from './content/schema';
import { attachCardChevron } from './tourChevron';
import TourPopover from './TourPopover';
import { useLocalize } from '~/hooks';

// driver.js's own default styling (from its bundled driver.css) still applies to
// the wrapper — reset it so the card is the only visible surface (otherwise it
// double-frames the card). Inline style, not a Tailwind class, because nothing
// guarantees our stylesheet loads after driver.css in the cascade.
const WRAPPER_RESET_STYLE: Partial<CSSStyleDeclaration> = {
  background: 'transparent',
  padding: '0',
  margin: '0',
  borderRadius: '0',
  boxShadow: 'none',
  maxWidth: 'none',
  minWidth: '0',
};

interface TourOptions {
  onEnd?: () => void;
  setSidebarExpanded?: (expanded: boolean) => void;
}

// Extra data carried alongside driver.js's own DriveStep fields — driver.js
// hands the same step object back to onHighlightStarted, so this survives
// the round trip without needing an index to look it up by.
type EngineStep = DriveStep & Pick<TourStep, 'expandSidebarBefore'>;

function toEngineStep(step: TourStep): EngineStep {
  return {
    element: step.element,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side,
    },
    expandSidebarBefore: step.expandSidebarBefore,
  };
}

export default function useCourseTour(
  getSteps: () => TourStep[],
  onComplete?: () => void,
  options: TourOptions = {},
) {
  const localize = useLocalize();
  // driver.js manipulates the DOM directly, so unmounting React doesn't clean it up.
  const tourRef = useRef<ReturnType<typeof driver> | null>(null);
  // Always-current ref so startTour can stay memoized on [onComplete, getSteps]
  // without closing over a stale onEnd/setSidebarExpanded from an earlier render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    return () => {
      tourRef.current?.destroy();
      tourRef.current = null;
    };
  }, []);

  const startTour = useCallback(() => {
    let completedFromLastStepNext = false;
    let currentPopoverRoot: Root | null = null;
    const steps = getSteps().map(toEngineStep);

    const renderPopover = (popover: PopoverDOM, driverInstance: Driver, step: EngineStep) => {
      currentPopoverRoot?.unmount();

      // The step's own title/description, not driver.js's rendered copy of them —
      // driver.js doesn't transform these, so reading them back via innerHTML
      // would just be a pointless round-trip through DOM we're about to hide.
      const titleHtml = step.popover?.title ?? '';
      const descriptionHtml = step.popover?.description ?? '';
      // Localized in place of driver.js's own un-translated "Next"/"Done" and
      // "{{current}} of {{total}}" defaults (popover.nextButton/progress).
      const progressText = localize('com_learning_tour_progress', {
        0: (driverInstance.getActiveIndex() ?? 0) + 1,
        1: steps.length,
      });
      const nextLabel = localize(driverInstance.isLastStep() ? 'com_ui_done' : 'com_ui_next');
      const canGoPrevious = !popover.previousButton.disabled;

      // driver.js sets `display` on these via inline style on every render, so only
      // another inline-style write (not a Tailwind class) can override it.
      [popover.title, popover.description, popover.footer, popover.closeButton, popover.arrow].forEach(
        (element) => {
          element.style.display = 'none';
        },
      );

      Object.assign(popover.wrapper.style, WRAPPER_RESET_STYLE);

      const container = document.createElement('div');
      popover.wrapper.appendChild(container);
      currentPopoverRoot = createRoot(container);
      // flushSync: driver.js measures the wrapper right after this returns.
      flushSync(() => {
        currentPopoverRoot?.render(
          <TourPopover
            titleHtml={titleHtml}
            descriptionHtml={descriptionHtml}
            progressText={progressText}
            nextLabel={nextLabel}
            canGoPrevious={canGoPrevious}
            onPrevious={() => driverInstance.movePrevious()}
            onNext={() => {
              if (driverInstance.isLastStep()) {
                completedFromLastStepNext = true;
              }
              driverInstance.moveNext();
            }}
            onClose={() => {
              currentPopoverRoot?.unmount();
              currentPopoverRoot = null;
              driverInstance.destroy();
              tourRef.current = null;
              optionsRef.current.onEnd?.();
            }}
          />,
        );
      });

      attachCardChevron(container, popover.arrow);
    };

    const tourDriver = driver({
      showProgress: true,
      allowClose: true,
      skipMissingElement: true,
      waitForElement: 600,
      stagePadding: 6,
      stageRadius: 8,
      overlayOpacity: 0.5,
      animate: false,
      onPopoverRender: (popover, opts) =>
        renderPopover(popover, opts.driver, steps[opts.state.activeIndex ?? 0]),
      onHighlightStarted: (_element, step) => {
        if ((step as EngineStep).expandSidebarBefore) {
          optionsRef.current.setSidebarExpanded?.(true);
        }
      },
      onDestroyStarted: () => {
        currentPopoverRoot?.unmount();
        currentPopoverRoot = null;
        tourDriver.destroy();
        tourRef.current = null;
        if (completedFromLastStepNext) {
          onComplete?.();
        }
        optionsRef.current.onEnd?.();
      },
      steps,
    });

    tourRef.current = tourDriver;
    tourDriver.drive();
  }, [onComplete, getSteps, localize]);

  return { startTour };
}
