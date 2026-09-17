import { useCallback, useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../driver-theme.css';

/**
 * Builds the Driver.js Getting Started tour over the default chat interface.
 * Driver.js owns the spotlight overlay, popover, and next/prev/progress
 * controls — no custom tour engine needed. `skipMissingElement` + `waitForElement`
 * make each step tolerant of elements that are conditionally rendered (permissions,
 * feature flags, viewport) or that need a moment to mount after a panel switch.
 *
 * Step order (27 steps, voice input removed):
 *   1  Welcome to MyAssist
 *   2  New Chat
 *   3  Model Selector          (AU hosting note added)
 *   4  Agent Marketplace       (moved up — choose a pre-configured agent)
 *   5  Message Box             (moved up — core interaction)
 *   6  Attach Files            (moved up — dropdown explainer)
 *   7  Run Code                (document manipulation added)
 *   8  Skills toolbar          (updated to agent instructions)
 *   9  Artifacts
 *   10 More Toggles
 *   11 Send
 *   12 Compare Chats
 *   13 Bookmark
 *   14 Sidebar Toggle
 *   15 Conversations
 *   16 Agent Builder
 *   17 Skills nav              (updated to agent instructions)
 *   18 Prompts
 *   19 Memories
 *   20 Bookmarks nav
 *   21 Files
 *   22 Parameters
 *   23 MCP Connectors          (business-friendly description)
 *   24 Learning Hub
 *   25 Search Conversations
 *   26 Projects
 *   27 Account Menu
 */
export default function useGettingStartedTour(onComplete?: () => void) {
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
        // ── 1. Welcome to MyAssist ───────────────────────────────────────────
        {
          element: "[data-testid='new-chat-button']",
          popover: {
            title: 'Welcome to MyAssist',
            description:
              "Welcome to the new and improved MyAssist. We've rebuilt from the ground up to give you access to more powerful AI tools.<br><br>In this guided tour, we'll take you through the chat interface and side panel, so you are comfortable navigating through the platform.",
            side: 'right',
          },
        },

        // ── 2. New Chat ──────────────────────────────────────────────────────
        {
          element: "[data-testid='new-chat-button']",
          popover: {
            title: 'New Chat',
            description:
              'Click here any time to start a brand new conversation. Your current chat is saved automatically, so nothing is lost.',
            side: 'right',
          },
        },

        // ── 3. Model Selector ────────────────────────────────────────────────
        {
          element: "[data-testid='model-selector-button']",
          popover: {
            title: 'Model',
            description:
              'Pick which AI model answers your messages. Different models are better at different tasks — some are faster, some handle longer documents, some are better at reasoning.<br/><br/><strong>Note: not all models are hosted in Australia — check with your administrator if data residency is a concern.</strong>',
            side: 'bottom',
          },
        },

        // ── 4. Agent Marketplace ─────────────────────────────────────────────
        {
          element: "[data-testid='nav-agents-marketplace-button']",
          popover: {
            title: 'Agent Marketplace',
            description:
              'Browse agents built for specific tasks and select the one that best fits what you need — no setup required.',
            side: 'right',
          },
        },

        // ── 5. Message Box ───────────────────────────────────────────────────
        {
          element: "[data-testid='text-input']",
          popover: {
            title: 'Message Box',
            description:
              'Type your message here. Press Enter to send, or Shift+Enter for a new line within the same message.',
            side: 'top',
          },
        },

        // ── 6. Attach Files ──────────────────────────────────────────────────
        {
          element: '#attach-file-menu-button',
          popover: {
            title: 'Attach Files',
            description:
              'Click to choose how to attach your file — each option changes how the model uses it:<br/><br/><strong>Upload as Text</strong> — extracts all text from a document and adds it directly to your message. Best for short documents where you want the full content visible.<br/><br/><strong>Upload for File Search</strong> — the recommended option for most documents. Breaks the file into sections the model can search and retrieve as needed, without overwhelming your message.<br/><br/><strong>Upload to Code Environment</strong> — use this when you need the model to open, read, or transform the file itself, such as reformatting a spreadsheet or extracting data.',
            side: 'top',
          },
        },

        // ── 7. Run Code ──────────────────────────────────────────────────────
        {
          element: "[data-testid='toolbar-toggle-code-interpreter']",
          popover: {
            title: 'Run Code',
            description:
              'Lets the model write and execute real code (Python, JS, and more) to solve a problem — great for calculations, data processing, document transformation, or generating a chart.',
            side: 'top',
          },
        },

        // ── 8. Skills (toolbar) ──────────────────────────────────────────────
        {
          element: "[data-testid='toolbar-toggle-skills']",
          popover: {
            title: 'Skills',
            description:
              'Attaches agent instructions to this message — use it to define how the model should behave or what it should know for this task.',
            side: 'top',
          },
        },

        // ── 9. Artifacts ─────────────────────────────────────────────────────
        {
          element: "[data-testid='toolbar-toggle-artifacts']",
          popover: {
            title: 'Artifacts',
            description:
              'Produces rich outputs like formatted documents, diagrams, and interactive previews in a separate panel alongside your chat — ideal for iterating on deliverables such as reports, data visualisations, or presentation content.',
            side: 'top',
          },
        },

        // ── 10. More Toggles ─────────────────────────────────────────────────
        {
          element:
            "[data-testid='toolbar-toggle-web-search'], [data-testid='toolbar-toggle-memory'], [data-testid='toolbar-toggle-file-search'], [data-testid='toolbar-toggle-mcp-servers']",
          popover: {
            title: 'Connectors',
            description:
              'Connect MyAssist to external tools and platforms — including KX, GIMS, and AFR — to bring real-time data and external functionality directly into your conversations.',
            side: 'top',
          },
        },

        // ── 11. Send ─────────────────────────────────────────────────────────
        {
          element: "[data-testid='send-button']",
          popover: {
            title: 'Send',
            description: 'Sends your message. This button lights up once you have typed something.',
            side: 'top',
          },
        },

        // ── 12. Compare Chats ────────────────────────────────────────────────
        {
          element: "[data-testid='add-multi-convo-button']",
          popover: {
            title: 'Compare Chats',
            description:
              'Opens a second conversation side-by-side so you can compare how two models (or two prompts) respond to the same question.',
            side: 'bottom',
          },
        },

        // ── 13. Bookmark ─────────────────────────────────────────────────────
        {
          element: "[data-testid='bookmark-menu']",
          popover: {
            title: 'Bookmark This Chat',
            description:
              'Tag the current conversation so you can find it again quickly — useful for grouping chats by project or topic.',
            side: 'bottom',
          },
        },

        // ── 14. Sidebar Toggle ───────────────────────────────────────────────
        {
          element: "[data-testid='open-sidebar-button'], [data-testid='close-sidebar-button']",
          popover: {
            title: 'Sidebar Toggle',
            description:
              'Collapses or expands the sidebar to give your conversation more room, or to bring back quick access to your chats, agents, and settings.',
            side: 'right',
          },
        },

        // ── 15. Conversations ────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-conversations']",
          popover: {
            title: 'Conversations',
            description: 'The default panel — your chat history, search, and projects all live here.',
            side: 'right',
          },
        },

        // ── 16. Agent Builder ────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-agents']",
          popover: {
            title: 'Agent Builder',
            description:
              'Create and configure your own custom agents — give them instructions, tools, and knowledge tailored to a specific job.',
            side: 'right',
          },
        },

        // ── 17. Skills (nav) ─────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-skills']",
          popover: {
            title: 'Skills',
            description:
              'Manage reusable instructions and knowledge for your agents — define how they behave and what they know.',
            side: 'right',
          },
        },

        // ── 18. Prompts ──────────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-prompts']",
          popover: {
            title: 'Prompts',
            description:
              'Save prompt templates you use often, then trigger them in chat with a /command instead of retyping them.',
            side: 'right',
          },
        },

        // ── 19. Memories ─────────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-memories']",
          popover: {
            title: 'Memories',
            description:
              'Review and manage what the assistant remembers about you across conversations.',
            side: 'right',
          },
        },

        // ── 20. Bookmarks (nav) ──────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-bookmarks']",
          popover: {
            title: 'Bookmarks',
            description:
              'Browse every conversation you have tagged, grouped by your own bookmark labels.',
            side: 'right',
          },
        },

        // ── 21. Files ────────────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-files']",
          popover: {
            title: 'Files',
            description: 'See every file you have uploaded across all your conversations in one place.',
            side: 'right',
          },
        },

        // ── 22. Parameters ───────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-parameters']",
          popover: {
            title: 'Parameters',
            description:
              'Fine-tune model settings like temperature and max tokens for the current conversation.',
            side: 'right',
          },
        },

        // ── 23. MCP Connectors ───────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-mcp-builder']",
          popover: {
            title: 'Connectors',
            description:
              'Connect to external tools and data sources — such as KX, GIMS, or AFR — to bring live information directly into your conversations.',
            side: 'right',
          },
        },

        // ── 24. Learning Hub ─────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-learning']",
          popover: {
            title: 'Learning Hub',
            description:
              "You're here right now! Come back any time to replay this tour or check for new ones.",
            side: 'right',
          },
        },

        // ── 25. Search Conversations ─────────────────────────────────────────
        {
          element: "[data-testid='nav-search-input']",
          popover: {
            title: 'Search Conversations',
            description:
              'Search across all of your past conversations by keyword — handy once you have more than a handful of chats.',
            side: 'bottom',
          },
        },

        // ── 26. Projects ─────────────────────────────────────────────────────
        {
          element: "[data-testid='nav-projects-section']",
          popover: {
            title: 'Projects',
            description:
              'Group related conversations into a project folder to keep long-running work organized and easy to find later.',
            side: 'bottom',
          },
        },

        // ── 27. Account Menu ─────────────────────────────────────────────────
        {
          element: "[data-testid='nav-user']",
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
  }, [onComplete]);

  return { startTour };
}
