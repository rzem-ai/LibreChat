import { useCallback, useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../driver-theme.css';
import type { DriveStep } from 'driver.js';
import { isUnavailableElement } from '~/utils/elements';
import { useShowMarketplace } from '~/hooks';
import { mainTextareaId } from '~/common';

/**
 * Index of the first step that requires the sidebar to be in its EXPANDED
 * state (panel body visible). Steps 0–6 target chat-area elements; from
 * step 7 (Conversations) onward the sidebar nav/content must be accessible.
 * Mobile: the sidebar is collapsed before the tour starts so chat steps are
 * unobstructed; it is re-expanded just before this index is reached.
 * Desktop: the sidebar panel body is hidden when collapsed, so we also
 * expand before this step regardless of the user's initial state.
 */
const FIRST_NAV_STEP_INDEX = 7;

/**
 * Builds the Driver.js Getting Started tour over the default chat interface.
 * Driver.js owns the spotlight overlay, popover, and next/prev/progress
 * controls — no custom tour engine needed. `skipMissingElement` + `waitForElement`
 * make each step tolerant of elements that are conditionally rendered (permissions,
 * feature flags, viewport) or that need a moment to mount after a panel switch.
 *
 * Step order (14 core steps, plus agent-selection steps when available).
 * Related items are merged into single multi-target steps (see the
 * "Tools", "Library & Connectors", and "Personalize & Manage" steps below) —
 * each uses a comma-separated selector so driver.js highlights whichever of
 * the group is first available while the popover describes the group as a
 * whole; skipMissingElement still tolerates any individual target being
 * absent.
 *   1  Welcome to MyAssist / New Chat
 *   2  Model Selector
 *   3  Message Box
 *   4  Attach Files
 *   5  Tools (Run Code, Skills, Artifacts, Connectors)
 *   6  Send
 *   7  Sidebar Toggle
 *   8  Conversations
 *   9  Projects
 *   10 Agent Builder
 *   11 Agent Marketplace
 *   12 Switch Back to a Model
 *   13 Library & Connectors (Skill Library, Prompt Library, Connectors List)
 *   14 Personalize & Manage (Memories, Files, Parameters)
 *   15 MyAssist Academy
 *   16 Account Menu
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
    // Do NOT eagerly filter steps here. Driver.js's own skipMissingElement +
    // waitForElement handles two cases correctly at runtime as each step is
    // reached: (a) genuinely absent elements (e.g. feature-flagged buttons not
    // rendered) are skipped automatically; (b) elements that are present but
    // not yet visible due to slow route/render are waited for up to
    // waitForElement ms. Filtering synchronously at construction time with a
    // fixed delay (200-300ms) causes steps to be permanently removed before
    // the UI has had time to render them, which waitForElement cannot recover.
    const tourDriver = driver({
      showProgress: true,
      allowClose: true,
      skipMissingElement: true,
      waitForElement: 600,
      stagePadding: 6,
      stageRadius: 8,
      // driver.js's `animate: true` (the default) doesn't just fade the popover —
      // it also runs a JS-driven loop that slides/resizes the spotlight cutout
      // from the previous target's position to the next one over `duration` ms.
      // That's a real glide/morph, not a fade, and there's no config to keep the
      // fade while disabling it. So: turn animate off (the spotlight now snaps
      // straight to each target) and fade the popover ourselves via a plain CSS
      // animation in driver-theme.css instead.
      animate: false,
      onHighlightStarted: (_element, step, opts) => {
        // Expand the sidebar exactly when the tour transitions from chat-area
        // steps (0–6) to sidebar-nav steps (7+). This ensures:
        // - Mobile: sidebar was collapsed before step 0 so chat steps are
        //   unobstructed; re-expanded here so nav elements are visible.
        // - Desktop: sidebar panel body is opacity-0/pointer-events-none when
        //   collapsed; expand so #nav-search-input, #nav-projects-section,
        //   and #nav-user are accessible/visible during their steps.
        if (opts.state.activeIndex === FIRST_NAV_STEP_INDEX && setSidebarExpanded) {
          setSidebarExpanded(true);
        }
      },
      onNextClick: () => {
        if (tourDriver.isLastStep()) {
          completedFromLastStepNext = true;
        }
        tourDriver.moveNext();
      },
      onDestroyStarted: () => {
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
