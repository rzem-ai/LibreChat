import { useCallback, useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../driver-theme.css';
import { isUnavailableElement } from '~/utils/elements';
import { useShowMarketplace } from '~/hooks';
import { mainTextareaId } from '~/common';

/**
 * Index of the first step that requires the sidebar to be in its EXPANDED
 * state (panel body visible). Steps 0–10 target chat-area elements; from
 * step 11 (Conversations) onward the sidebar nav/content must be accessible.
 * Mobile: the sidebar is collapsed before the tour starts so chat steps are
 * unobstructed; it is re-expanded just before this index is reached.
 * Desktop: the sidebar panel body is hidden when collapsed, so we also
 * expand before this step regardless of the user's initial state.
 */
const FIRST_NAV_STEP_INDEX = 11;

/**
 * Builds the Driver.js Getting Started tour over the default chat interface.
 * Driver.js owns the spotlight overlay, popover, and next/prev/progress
 * controls — no custom tour engine needed. `skipMissingElement` + `waitForElement`
 * make each step tolerant of elements that are conditionally rendered (permissions,
 * feature flags, viewport) or that need a moment to mount after a panel switch.
 *
 * Step order (22 core steps, plus agent-selection steps when available):
 *   1  Welcome to MyAssist
 *   2  New Chat
 *   3  Model Selector
 *   4  Message Box
 *   5  Attach Files
 *   6  Run Code
 *   7  Skills toolbar
 *   8  Artifacts
 *   9  Connectors
 *   10 Send
 *   11 Sidebar Toggle
 *   12 Conversations
 *   13 Projects
 *   14 Agent Builder
 *   15 Agent Marketplace
 *   16 Switch Back to a Model
 *   17 Skill Library
 *   18 Prompt Library
 *   19 Memories
 *   20 Files
 *   21 Parameters
 *   22 Connectors List
 *   23 MyAssist Academy
 *   24 Account Menu
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
    const steps = [
      {
        element: '#new-chat-button',
        popover: {
          title: 'Welcome to MyAssist',
          description:
            "Welcome to the new and improved MyAssist! We've rebuilt from the ground up to give you access to more powerful AI tools.<br><br>In this guided tour, we'll take you through the chat interface and side panel, so you are comfortable navigating through the platform.",
          side: 'right',
        },
      },
      {
        element: '#new-chat-button',
        popover: {
          title: 'New Chat',
          description:
            'Click here any time to start a brand new conversation. Your current chat is saved automatically, so nothing is lost.',
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
        element: '#toolbar-toggle-code-interpreter',
        popover: {
          title: 'Run Code',
          description:
            'Gives MyAssist a secure working area to analyse data, work through calculations, transform files, and produce charts or tables for you behind the scenes.',
          side: 'top',
        },
      },
      {
        element: '#toolbar-toggle-skills',
        popover: {
          title: 'Skills',
          description:
            'Skills are instruction files which give the AI access to repeatable patterns. If a skill is enabled, the AI will auto-select it when you send a relevant query.<br/><br/>For example, if you ask the AI to summarise a meeting, you may see the meeting-summariser skill get called.',
          side: 'top',
        },
      },
      {
        element: '#toolbar-toggle-artifacts',
        popover: {
          title: 'Artifacts',
          description:
            'Produces rich outputs like formatted documents, diagrams, and interactive previews in a separate panel alongside your chat — ideal for iterating on deliverables such as reports, data visualisations, or presentation content.',
          side: 'top',
        },
      },
      {
        element:
          '#toolbar-toggle-mcp-servers, #toolbar-toggle-web-search, #toolbar-toggle-memory, #toolbar-toggle-file-search',
        popover: {
          title: 'Connectors',
          description:
            'Use connectors to give MyAssist access to approved data sources and systems, so it can answer questions with information beyond the current chat.',
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
        element: '#nav-panel-skills',
        popover: {
          title: 'Skill Library',
          description:
            'This is where you can create, edit and share skills. Skills are reusable instruction files that help the AI follow repeatable patterns.',
          side: 'right',
        },
      },
      {
        element: '#nav-panel-prompts',
        popover: {
          title: 'Prompt Library',
          description:
            'This is where you can create, edit and share prompts. Save prompt templates you use often, then trigger them in chat by typing / to bring up the prompt search, instead of retyping them.',
          side: 'right',
        },
      },
      {
        element: '#nav-panel-memories',
        popover: {
          title: 'Memories',
          description:
            'Review and manage what the assistant remembers about you across conversations.',
          side: 'right',
        },
      },
      {
        element: '#nav-panel-files',
        popover: {
          title: 'Files',
          description:
            'See every file you have uploaded across all your conversations in one place.',
          side: 'right',
        },
      },
      {
        element: '#nav-panel-parameters',
        popover: {
          title: 'Parameters',
          description: 'Adjust advanced response settings for the current conversation.',
          side: 'right',
        },
      },
      {
        element: '#nav-panel-mcp-builder',
        popover: {
          title: 'Connectors',
          description: 'This is where you see the list of connectors available to you.',
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
    ] as const;
    // Cast to mutable array for driver() which expects DriveStep[]
    const stepsArray = steps as unknown as Array<{ element: string; popover: { title: string; description: string; side: 'top' | 'right' | 'bottom' | 'left' } }>;
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
      onHighlightStarted: (_element, step, opts) => {
        // Expand the sidebar exactly when the tour transitions from chat-area
        // steps (0–10) to sidebar-nav steps (11+). This ensures:
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
      steps: stepsArray,
    });

    // Store the instance so the useEffect cleanup can destroy it on unmount.
    tourRef.current = tourDriver;
    tourDriver.drive();
  }, [onComplete, showMarketplace]);

  return { startTour };
}
