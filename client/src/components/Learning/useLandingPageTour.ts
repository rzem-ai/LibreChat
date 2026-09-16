import { useCallback, useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './driver-theme.css';
import { useLocalize } from '~/hooks';

/**
 * Builds a Driver.js tour over the elements on the default landing page.
 * Driver.js owns the spotlight overlay, popover, and next/prev/progress
 * controls — no custom tour engine needed. `skipMissingElement` + `waitForElement`
 * make each step tolerant of elements that are conditionally rendered (permissions,
 * feature flags, viewport) or that need a moment to mount after a panel switch.
 *
 * Step order (26 steps, voice input removed):
 *   1  New Chat
 *   2  Model Selector          (AU hosting note added)
 *   3  Agent Marketplace       (moved up — choose a pre-configured agent)
 *   4  Message Box             (moved up — core interaction)
 *   5  Attach Files            (moved up — dropdown explainer)
 *   6  Run Code                (document manipulation added)
 *   7  Skills toolbar          (updated to agent instructions)
 *   8  Artifacts
 *   9  More Toggles
 *   10 Send
 *   11 Compare Chats
 *   12 Bookmark
 *   13 Sidebar Toggle
 *   14 Conversations
 *   15 Agent Builder
 *   16 Skills nav              (updated to agent instructions)
 *   17 Prompts
 *   18 Memories
 *   19 Bookmarks nav
 *   20 Files
 *   21 Parameters
 *   22 MCP Connectors          (business-friendly description)
 *   23 Learning Hub
 *   24 Search Conversations
 *   25 Projects
 *   26 Account Menu
 */
export default function useLandingPageTour(onComplete?: () => void) {
  const localize = useLocalize();

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
        // ── 1. New Chat ──────────────────────────────────────────────────────
        {
          element: "[data-testid='new-chat-button']",
          popover: {
            title: localize('com_learning_tour_new_chat_title'),
            description: localize('com_learning_tour_new_chat_description'),
            side: 'right',
          },
        },

        // ── 2. Model Selector ────────────────────────────────────────────────
        {
          element: "[data-testid='model-selector-button']",
          popover: {
            title: localize('com_ui_model'),
            description: localize('com_learning_tour_model_selector_description'),
            side: 'bottom',
          },
        },

        // ── 3. Agent Marketplace ─────────────────────────────────────────────
        {
          element: "[data-testid='nav-agents-marketplace-button']",
          popover: {
            title: localize('com_learning_tour_agent_marketplace_title'),
            description: localize('com_learning_tour_agent_marketplace_description'),
            side: 'right',
          },
        },

        // ── 4. Message Box ───────────────────────────────────────────────────
        {
          element: "[data-testid='text-input']",
          popover: {
            title: localize('com_learning_tour_message_box_title'),
            description: localize('com_learning_tour_message_box_description'),
            side: 'top',
          },
        },

        // ── 5. Attach Files ──────────────────────────────────────────────────
        {
          element: "[data-testid='attach-file-menu-button']",
          popover: {
            title: localize('com_learning_tour_attach_files_title'),
            description: localize('com_learning_tour_attach_files_description'),
            side: 'top',
          },
        },

        // ── 6. Run Code ──────────────────────────────────────────────────────
        {
          element: "[data-testid='toolbar-toggle-code-interpreter']",
          popover: {
            title: localize('com_learning_tour_run_code_title'),
            description: localize('com_learning_tour_run_code_description'),
            side: 'top',
          },
        },

        // ── 7. Skills (toolbar) ──────────────────────────────────────────────
        {
          element: "[data-testid='toolbar-toggle-skills']",
          popover: {
            title: localize('com_learning_tour_skills_toolbar_title'),
            description: localize('com_learning_tour_skills_toolbar_description'),
            side: 'top',
          },
        },

        // ── 8. Artifacts ─────────────────────────────────────────────────────
        {
          element: "[data-testid='toolbar-toggle-artifacts']",
          popover: {
            title: localize('com_learning_tour_artifacts_title'),
            description: localize('com_learning_tour_artifacts_description'),
            side: 'top',
          },
        },

        // ── 9. More Toggles ──────────────────────────────────────────────────
        {
          element:
            "[data-testid='toolbar-toggle-web-search'], [data-testid='toolbar-toggle-memory'], [data-testid='toolbar-toggle-file-search'], [data-testid='toolbar-toggle-mcp-servers']",
          popover: {
            title: localize('com_learning_tour_more_toggles_title'),
            description: localize('com_learning_tour_more_toggles_description'),
            side: 'top',
          },
        },

        // ── 10. Send ─────────────────────────────────────────────────────────
        {
          element: "[data-testid='send-button']",
          popover: {
            title: localize('com_learning_tour_send_title'),
            description: localize('com_learning_tour_send_description'),
            side: 'top',
          },
        },

        // ── 11. Compare Chats ────────────────────────────────────────────────
        {
          element: "[data-testid='add-multi-convo-button']",
          popover: {
            title: localize('com_learning_tour_compare_chats_title'),
            description: localize('com_learning_tour_compare_chats_description'),
            side: 'bottom',
          },
        },

        // ── 12. Bookmark ─────────────────────────────────────────────────────
        {
          element: "[data-testid='bookmark-menu']",
          popover: {
            title: localize('com_learning_tour_bookmark_title'),
            description: localize('com_learning_tour_bookmark_description'),
            side: 'bottom',
          },
        },

        // ── 13. Sidebar Toggle ───────────────────────────────────────────────
        {
          element: "[data-testid='open-sidebar-button'], [data-testid='close-sidebar-button']",
          popover: {
            title: localize('com_learning_tour_sidebar_toggle_title'),
            description: localize('com_learning_tour_sidebar_toggle_description'),
            side: 'right',
          },
        },

        // ── 14. Conversations ────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-conversations']",
          popover: {
            title: localize('com_learning_tour_conversations_title'),
            description: localize('com_learning_tour_conversations_description'),
            side: 'right',
          },
        },

        // ── 15. Agent Builder ────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-agents']",
          popover: {
            title: localize('com_learning_tour_agent_builder_title'),
            description: localize('com_learning_tour_agent_builder_description'),
            side: 'right',
          },
        },

        // ── 16. Skills (nav) ─────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-skills']",
          popover: {
            title: localize('com_learning_tour_skills_nav_title'),
            description: localize('com_learning_tour_skills_nav_description'),
            side: 'right',
          },
        },

        // ── 17. Prompts ──────────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-prompts']",
          popover: {
            title: localize('com_learning_tour_prompts_title'),
            description: localize('com_learning_tour_prompts_description'),
            side: 'right',
          },
        },

        // ── 18. Memories ─────────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-memories']",
          popover: {
            title: localize('com_learning_tour_memories_title'),
            description: localize('com_learning_tour_memories_description'),
            side: 'right',
          },
        },

        // ── 19. Bookmarks (nav) ──────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-bookmarks']",
          popover: {
            title: localize('com_learning_tour_bookmarks_nav_title'),
            description: localize('com_learning_tour_bookmarks_nav_description'),
            side: 'right',
          },
        },

        // ── 20. Files ────────────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-files']",
          popover: {
            title: localize('com_learning_tour_files_title'),
            description: localize('com_learning_tour_files_description'),
            side: 'right',
          },
        },

        // ── 21. Parameters ───────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-parameters']",
          popover: {
            title: localize('com_learning_tour_parameters_title'),
            description: localize('com_learning_tour_parameters_description'),
            side: 'right',
          },
        },

        // ── 22. MCP Connectors ───────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-mcp-builder']",
          popover: {
            title: localize('com_learning_tour_mcp_connectors_title'),
            description: localize('com_learning_tour_mcp_connectors_description'),
            side: 'right',
          },
        },

        // ── 23. Learning Hub ─────────────────────────────────────────────────
        {
          element: "[data-testid='nav-panel-learning']",
          popover: {
            title: localize('com_learning_tour_learning_hub_title'),
            description: localize('com_learning_tour_learning_hub_description'),
            side: 'right',
          },
        },

        // ── 24. Search Conversations ─────────────────────────────────────────
        {
          element: "[data-testid='nav-search-input']",
          popover: {
            title: localize('com_learning_tour_search_conversations_title'),
            description: localize('com_learning_tour_search_conversations_description'),
            side: 'bottom',
          },
        },

        // ── 25. Projects ─────────────────────────────────────────────────────
        {
          element: "[data-testid='nav-projects-section']",
          popover: {
            title: localize('com_learning_tour_projects_title'),
            description: localize('com_learning_tour_projects_description'),
            side: 'bottom',
          },
        },

        // ── 26. Account Menu ─────────────────────────────────────────────────
        {
          element: "[data-testid='nav-user']",
          popover: {
            title: localize('com_learning_tour_account_menu_title'),
            description: localize('com_learning_tour_account_menu_description'),
            side: 'top',
          },
        },
      ],
    });

    // Store the instance so the useEffect cleanup can destroy it on unmount.
    tourRef.current = tourDriver;
    tourDriver.drive();
  }, [localize, onComplete]);

  return { startTour };
}
