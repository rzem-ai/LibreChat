import { useCallback, useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { DriveStep, Driver, PopoverDOM } from 'driver.js';
import TourPopover from './TourPopover';
import { isUnavailableElement } from '~/utils/elements';
import { useShowMarketplace } from '~/hooks';
import { mainTextareaId } from '~/common';

type Side = 'top' | 'right' | 'bottom' | 'left';

const CHEVRON_OFFSET = '-6px';
const chevronEdgeStyle: Record<Side, Partial<CSSStyleDeclaration>> = {
  top: { bottom: CHEVRON_OFFSET, left: '50%', marginLeft: CHEVRON_OFFSET },
  bottom: { top: CHEVRON_OFFSET, left: '50%', marginLeft: CHEVRON_OFFSET },
  left: { right: CHEVRON_OFFSET, top: '50%', marginTop: CHEVRON_OFFSET },
  right: { left: CHEVRON_OFFSET, top: '50%', marginTop: CHEVRON_OFFSET },
};

/**
 * Attaches a small diamond chevron to the card, on whichever edge faces the
 * target. driver.js decides that side (via a class on the wrapper) only
 * after `onPopoverRender` returns, hence the microtask. If it couldn't fit
 * the popover to any side (falls back to centered), there's no side to point
 * from — same as driver.js's own arrow in that case, so no chevron either.
 */
function attachCardChevron(container: HTMLElement, wrapper: HTMLElement) {
  queueMicrotask(() => {
    const side = (Object.keys(chevronEdgeStyle) as Side[]).find((value) =>
      wrapper.classList.contains(`driver-popover-side-${value}`),
    );
    if (!side) {
      return;
    }
    const chevron = document.createElement('div');
    chevron.className = 'absolute size-3 rotate-45 bg-surface-primary';
    Object.assign(chevron.style, chevronEdgeStyle[side]);
    container.style.position = 'relative';
    container.insertBefore(chevron, container.firstChild);
  });
}

/**
 * First step index needing the sidebar EXPANDED (steps before it are chat-area
 * only). Keep in sync with the "Conversations" step's position below.
 */
const FIRST_NAV_STEP_INDEX = 7;

/**
 * Builds the Driver.js Getting Started tour over the default chat interface.
 * Related items are merged into single steps (see "Tools", "Library &
 * Connectors", "Personalize & Manage" below) via a comma-separated selector,
 * so driver.js highlights whichever of the group is first available while the
 * popover describes the group as a whole.
 */
interface TourOptions {
  /** Called when the tour ends (completed or cancelled). The caller uses this
   *  to restore the sidebar to its pre-tour expanded/collapsed state. */
  onEnd?: () => void;
  /** Setter for sidebar expanded state — used to expand before nav steps. */
  setSidebarExpanded?: (expanded: boolean) => void;
}

export default function useGettingStartedTour(onComplete?: () => void, options: TourOptions = {}) {
  const { onEnd, setSidebarExpanded } = options;
  const showMarketplace = useShowMarketplace();
  // Retain the active Driver.js instance so it can be destroyed on unmount.
  // Driver.js manipulates the DOM directly (body-level overlay + popover), so
  // React unmounting the provider tree (e.g. on logout) does NOT remove those
  // nodes automatically — we must call destroy() ourselves.
  const tourRef = useRef<ReturnType<typeof driver> | null>(null);

  useEffect(() => {
    return () => {
      // Unmount cleanup: destroy any active tour so the overlay/popover are
      // removed before the login page renders. tourRef is nulled after each
      // destroy (both here and in onDestroyStarted) to prevent double-destroy.
      tourRef.current?.destroy();
      tourRef.current = null;
    };
  }, []);

  const startTour = useCallback(() => {
    let completedFromLastStepNext = false;
    // Tracks the React root mounted into the current step's popover, so it can
    // be unmounted before the next step's popover replaces it (driver.js
    // recreates the whole popover DOM fresh on every step) and when the tour
    // ends.
    let currentPopoverRoot: Root | null = null;

    /** Mounts TourPopover into driver.js's popover wrapper, reusing the values
     *  driver.js already computed onto its own (about-to-be-hidden) elements —
     *  title/description HTML, progress text, next label, previous-enabled. */
    const renderPopover = (popover: PopoverDOM, driverInstance: Driver) => {
      currentPopoverRoot?.unmount();

      const titleHtml = popover.title.innerHTML;
      const descriptionHtml = popover.description.innerHTML;
      const progressText = popover.progress.innerHTML;
      const nextLabel = popover.nextButton.innerHTML;
      const canGoPrevious = !popover.previousButton.disabled;

      // Hide driver.js's own generated content — we render our own below —
      // but leave the elements themselves in place (just display:none) rather
      // than removing them, since driver.js still holds references to them.
      popover.title.style.display = 'none';
      popover.description.style.display = 'none';
      popover.footer.style.display = 'none';
      popover.closeButton.style.display = 'none';
      popover.arrow.style.display = 'none';

      // driver.js's own default CSS still applies to the wrapper itself —
      // white background, padding, a border-radius, a box-shadow, and a
      // max-width — which would frame TourPopover's card in a second, visually
      // mismatched box. Strip it down to a plain positioning shell so the card
      // is the only visible surface.
      Object.assign(popover.wrapper.style, {
        background: 'transparent',
        padding: '0',
        margin: '0',
        borderRadius: '0',
        boxShadow: 'none',
        maxWidth: 'none',
        minWidth: '0',
      });

      const container = document.createElement('div');
      popover.wrapper.appendChild(container);
      currentPopoverRoot = createRoot(container);
      // flushSync forces the render to commit synchronously, before this
      // function returns — driver.js measures the wrapper's rendered size to
      // position the popover immediately after onPopoverRender runs, so it
      // needs our content already painted, not merely scheduled.
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
              // destroy() skips onDestroyStarted (that hook is for the
              // Escape/overlay-click paths), so replicate its cleanup here.
              driverInstance.destroy();
              tourRef.current = null;
              onEnd?.();
            }}
          />,
        );
      });

      attachCardChevron(container, popover.wrapper);
    };

    const hasAvailableTarget = (selector: string) => {
      try {
        const targets = document.querySelectorAll<HTMLElement>(selector);
        return Array.from(targets).some((target) => !isUnavailableElement(target));
      } catch {
        return false;
      }
    };
    const canShowAgentSelectionSteps =
      showMarketplace &&
      hasAvailableTarget('#nav-panel-conversations') &&
      hasAvailableTarget('#nav-agents-marketplace-button');
    const steps: DriveStep[] = [
      {
        element: '#new-chat-button',
        popover: {
          title: 'Welcome to MyAssist',
          description:
            "Welcome to the new and improved MyAssist! We've rebuilt from the ground up to give you access to more powerful AI tools, and this guided tour will get you comfortable navigating the chat interface and side panel.<br><br>This button starts a brand new conversation any time — your current chat is saved automatically, so nothing is lost.",
          side: 'right',
        },
      },
      {
        element: '#model-selector-button',
        popover: {
          title: 'Model',
          description:
            'Pick which model or agent answers your messages. Different options are better at different tasks — some are faster, some handle longer documents, and some are better at reasoning. A higher cost factor generally means a model is better suited to complex tasks.<br/><br/><strong>If you require your data to stay onshore in Australia, choose a model provider with "AU" in the title.</strong>',
          side: 'bottom',
        },
      },
      {
        element: `#${mainTextareaId}`,
        popover: {
          title: 'Message Box',
          description:
            'Type your message here. Press Enter to send, or Shift+Enter for a new line within the same message.',
          side: 'top',
        },
      },
      {
        element: '#attach-file-menu-button',
        popover: {
          title: 'Attach Files',
          description:
            'Click to choose how to attach your file — each option changes how the model uses it:<br/><br/><strong>Upload as Text</strong> — extracts all text from a document and adds it directly to your message. Best for short documents where you want the full content visible.<br/><br/><strong>Upload for File Search</strong> — the recommended option for most documents. Breaks the file into sections the model can search and retrieve as needed, without overwhelming your message.<br/><br/><strong>Upload to Code Environment</strong> — use this when you need the model to open, read, or transform the file itself, such as reformatting a spreadsheet or extracting data.',
          side: 'top',
        },
      },
      {
        element:
          '#toolbar-toggle-code-interpreter, #toolbar-toggle-skills, #toolbar-toggle-artifacts, #toolbar-toggle-mcp-servers, #toolbar-toggle-web-search, #toolbar-toggle-memory, #toolbar-toggle-file-search',
        popover: {
          title: 'Tools',
          description:
            'The toolbar below your message box gives MyAssist extra capabilities:<br/><br/><strong>Run Code</strong> — a secure working area to analyse data, run calculations, transform files, and produce charts or tables.<br/><br/><strong>Skills</strong> — instruction files the AI can auto-select for repeatable patterns, like summarising a meeting.<br/><br/><strong>Artifacts</strong> — rich outputs like formatted documents, diagrams, and interactive previews in a separate panel.<br/><br/><strong>Connectors</strong> — give MyAssist access to approved data sources and systems, like web search or your memory.',
          side: 'top',
        },
      },
      {
        element: '#send-button',
        popover: {
          title: 'Send',
          description:
            'Click here or hit Enter to send your message. This button lights up once you have typed something.',
          side: 'top',
        },
      },
      {
        element: '#open-sidebar-button, #close-sidebar-button',
        popover: {
          title: 'Sidebar Toggle',
          description:
            'Collapses or expands the sidebar to give your conversation more room, or to bring back quick access to your chats, agents, and settings.',
          side: 'right',
        },
      },
      {
        element: '#nav-panel-conversations',
        popover: {
          title: 'Conversations',
          description: 'The default panel — your chat history, search, and projects all live here.',
          side: 'right',
        },
      },
      {
        element: '#nav-projects-section',
        popover: {
          title: 'Projects',
          description:
            'Group related conversations into a project folder to keep long-running work organised and easy to find later.',
          side: 'bottom',
        },
      },
      {
        element: '#nav-panel-agents',
        popover: {
          title: 'Agent Builder',
          description:
            'Agents are a collection of skills, connectors, files, and instructions grouped together for a specific job. Build and configure your own here.',
          side: 'right',
        },
      },
      ...(canShowAgentSelectionSteps
        ? ([
            {
              element: '#nav-agents-marketplace-button',
              popover: {
                title: 'Agent Marketplace',
                description:
                  'Browse pre-built agents for common tasks. Each agent combines instructions, skills, connectors, files, and guidance so you can get started faster.',
                side: 'right',
              },
            },
            {
              element: '#model-selector-button',
              popover: {
                title: 'Switch Back to a Model',
                description:
                  'If you are using an agent and want to return to a general model, open this selector and choose a standard model instead.',
                side: 'bottom',
              },
            },
          ] as const)
        : []),
      {
        element: '#nav-panel-skills, #nav-panel-prompts, #nav-panel-mcp-builder',
        popover: {
          title: 'Library & Connectors',
          description:
            'From the sidebar you can also manage your <strong>Skills</strong> and <strong>Prompts</strong> — reusable instructions and templates you create, edit, and share — plus see the full list of <strong>Connectors</strong> available to you.',
          side: 'right',
        },
      },
      {
        element: '#nav-panel-memories, #nav-panel-files, #nav-panel-parameters',
        popover: {
          title: 'Personalize & Manage',
          description:
            'A few more panels worth knowing about:<br/><br/><strong>Memories</strong> — review what the assistant remembers about you across conversations.<br/><br/><strong>Files</strong> — see every file you have uploaded across all your conversations in one place.<br/><br/><strong>Parameters</strong> — adjust advanced response settings for the current conversation.',
          side: 'right',
        },
      },
      {
        element: '#nav-panel-learning',
        popover: {
          title: 'MyAssist Academy',
          description:
            "You're here right now! Come back any time to revisit this tour or check for new learning content.",
          side: 'right',
        },
      },
      {
        element: '#nav-user',
        popover: {
          title: 'Account Menu',
          description: 'Access your profile, settings, theme, and sign-out option from here.',
          side: 'top',
        },
      },
    ];
    // Don't pre-filter steps by DOM presence — skipMissingElement +
    // waitForElement handle both absent and slow-to-mount targets at runtime.
    const tourDriver = driver({
      showProgress: true,
      allowClose: true,
      skipMissingElement: true,
      waitForElement: 600,
      stagePadding: 6,
      stageRadius: 8,
      // Lighter than driver.js's 0.7 default — still enough contrast for the
      // spotlight to read, without dimming the rest of the screen so heavily.
      overlayOpacity: 0.5,
      // animate:true also slides/resizes the spotlight between steps, not just
      // fades — TourPopover's own `animate-in fade-in-0` handles the fade instead.
      animate: false,
      onPopoverRender: (popover, opts) => renderPopover(popover, opts.driver),
      onHighlightStarted: (_element, step, opts) => {
        // Expand the sidebar once the tour reaches the first nav-panel step —
        // it may be collapsed (mobile) or panel-body-hidden (desktop) until now.
        if (opts.state.activeIndex === FIRST_NAV_STEP_INDEX && setSidebarExpanded) {
          setSidebarExpanded(true);
        }
      },
      onDestroyStarted: () => {
        currentPopoverRoot?.unmount();
        currentPopoverRoot = null;
        tourDriver.destroy();
        // Null the ref so the useEffect cleanup won't attempt a second destroy.
        tourRef.current = null;
        if (completedFromLastStepNext) {
          onComplete?.();
        }
        // Notify the caller so it can restore the pre-tour sidebar state.
        onEnd?.();
      },
      steps,
    });

    // Store the instance so the useEffect cleanup can destroy it on unmount.
    tourRef.current = tourDriver;
    tourDriver.drive();
  }, [onComplete, showMarketplace]);

  return { startTour };
}
