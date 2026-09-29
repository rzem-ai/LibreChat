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

const CHEVRON_OFFSET = '-6px';

// Reuses driver.js's own (hidden) arrow position/side rather than guessing —
// it's set only after onPopoverRender returns, hence the microtask.
function attachCardChevron(container: HTMLElement, arrow: HTMLElement) {
  queueMicrotask(() => {
    const side = (['top', 'right', 'bottom', 'left'] as const).find((value) =>
      arrow.classList.contains(`driver-popover-arrow-side-${value}`),
    );
    if (!side) {
      return;
    }
    const chevron = document.createElement('div');
    chevron.className = 'absolute size-3 rotate-45 bg-surface-primary';
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

// Index of the "Conversations" step — the first one needing the sidebar expanded.
const FIRST_NAV_STEP_INDEX = 7;

interface TourOptions {
  onEnd?: () => void;
  setSidebarExpanded?: (expanded: boolean) => void;
}

export default function useGettingStartedTour(onComplete?: () => void, options: TourOptions = {}) {
  const { onEnd, setSidebarExpanded } = options;
  const showMarketplace = useShowMarketplace();
  // driver.js manipulates the DOM directly, so unmounting React doesn't clean it up.
  const tourRef = useRef<ReturnType<typeof driver> | null>(null);

  useEffect(() => {
    return () => {
      tourRef.current?.destroy();
      tourRef.current = null;
    };
  }, []);

  const startTour = useCallback(() => {
    let completedFromLastStepNext = false;
    let currentPopoverRoot: Root | null = null;

    const renderPopover = (popover: PopoverDOM, driverInstance: Driver) => {
      currentPopoverRoot?.unmount();

      const titleHtml = popover.title.innerHTML;
      const descriptionHtml = popover.description.innerHTML;
      const progressText = popover.progress.innerHTML;
      const nextLabel = popover.nextButton.innerHTML;
      const canGoPrevious = !popover.previousButton.disabled;

      popover.title.style.display = 'none';
      popover.description.style.display = 'none';
      popover.footer.style.display = 'none';
      popover.closeButton.style.display = 'none';
      popover.arrow.style.display = 'none';

      // Strip driver.js's own default styling off the wrapper so the card is
      // the only visible surface (otherwise it double-frames the card).
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
              onEnd?.();
            }}
          />,
        );
      });

      attachCardChevron(container, popover.arrow);
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
    const tourDriver = driver({
      showProgress: true,
      allowClose: true,
      skipMissingElement: true,
      waitForElement: 600,
      stagePadding: 6,
      stageRadius: 8,
      overlayOpacity: 0.5,
      animate: false,
      onPopoverRender: (popover, opts) => renderPopover(popover, opts.driver),
      onHighlightStarted: (_element, step, opts) => {
        if (opts.state.activeIndex === FIRST_NAV_STEP_INDEX && setSidebarExpanded) {
          setSidebarExpanded(true);
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
        onEnd?.();
      },
      steps,
    });

    tourRef.current = tourDriver;
    tourDriver.drive();
  }, [onComplete, showMarketplace]);

  return { startTour };
}
