import { useCallback, useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../driver-theme.css';
import { useShowMarketplace } from '~/hooks';
import { isUnavailableElement } from '~/utils/elements';

/**
 * Builds the Driver.js Getting Started tour over the default chat interface.
 * Driver.js owns the spotlight overlay, popover, and next/prev/progress
 * controls — no custom tour engine needed. `skipMissingElement` + `waitForElement`
 * make each step tolerant of elements that are conditionally rendered (permissions,
 * feature flags, viewport) or that need a moment to mount after a panel switch.
 *
 * Step order (24 core steps, plus agent-selection steps when available):
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
 *   13 Search Conversations
 *   14 Projects
 *   15 Agent Builder
 *   16 Skill Library
 *   17 Prompt Library
 *   18 Memories
 *   19 Bookmarks
 *   20 Files
 *   21 Parameters
 *   22 Connectors List
 *   23 Agent Marketplace
 *   24 Switch Back to a Model
 *   25 Learning Hub
 *   26 Account Menu
 */
export default function useGettingStartedTour(onComplete?: () => void) {
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
    const canShowAgentSelectionSteps =
      showMarketplace &&
      (() => {
        const conversationsButton = document.getElementById('nav-panel-conversations');
        const marketplaceButton = document.getElementById('nav-agents-marketplace-button');
        return (
          conversationsButton != null &&
          marketplaceButton != null &&
          !isUnavailableElement(conversationsButton) &&
          !isUnavailableElement(marketplaceButton)
        );
      })();
    const tourDriver = driver({
      showProgress: true,
      allowClose: true,
      skipMissingElement: true,
      waitForElement: 600,
      stagePadding: 6,
      stageRadius: 8,
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
      },
      steps: [
        {
          element: '#new-chat-button',
          popover: {
            title: 'Welcome to MyAssist',
            description:
              "Welcome to the new and improved MyAssist. We've rebuilt from the ground up to give you access to more powerful AI tools.<br><br>In this guided tour, we'll take you through the chat interface and side panel, so you are comfortable navigating through the platform.",
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
              'Pick which model or agent answers your messages. Different options are better at different tasks — some are faster, some handle longer documents, and some are better at reasoning.<br/><br/><strong>If you are not sure where to start, choose a model provider with "AU" in the title.</strong>',
            side: 'bottom',
          },
        },
        {
          element: "[data-testid='text-input']",
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
          element: "[data-testid='send-button']",
          popover: {
            title: 'Send',
            description: 'Sends your message. This button lights up once you have typed something.',
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
          element: '#nav-search-input',
          popover: {
            title: 'Search Conversations',
            description:
              'Search across all of your past conversations by keyword — handy once you have more than a handful of chats.',
            side: 'bottom',
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
              'This is where you can create, edit and share prompts. Save prompt templates you use often, then trigger them in chat with a /command instead of retyping them.',
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
          element: '#nav-panel-bookmarks',
          popover: {
            title: 'Bookmarks',
            description:
              'Browse every conversation you have tagged, grouped by your own bookmark labels.',
            side: 'right',
          },
        },
        {
          element: '#nav-panel-files',
          popover: {
            title: 'Files',
            description: 'See every file you have uploaded across all your conversations in one place.',
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
        ...(canShowAgentSelectionSteps
          ? [
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
            ]
          : []),
        {
          element: '#nav-panel-learning',
          popover: {
            title: 'Learning Hub',
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
      ],
    });

    // Store the instance so the useEffect cleanup can destroy it on unmount.
    tourRef.current = tourDriver;
    tourDriver.drive();
  }, [onComplete, showMarketplace]);

  return { startTour };
}
