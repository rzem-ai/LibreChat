import { useCallback } from 'react';
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
 */
export default function useLandingPageTour(onComplete?: () => void) {
  const localize = useLocalize();

  const startTour = useCallback(() => {
    const tourDriver = driver({
      showProgress: true,
      allowClose: true,
      skipMissingElement: true,
      waitForElement: 600,
      stagePadding: 6,
      stageRadius: 8,
      onDestroyStarted: () => {
        tourDriver.destroy();
        onComplete?.();
      },
      steps: [
        {
          element: "[data-testid='new-chat-button']",
          popover: {
            title: 'New Chat',
            description:
              'Click here any time to start a brand new conversation. Your current chat is saved automatically, so nothing is lost.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='model-selector-button']",
          popover: {
            title: localize('com_ui_model'),
            description:
              'Pick which AI model answers your messages. Different models are better at different tasks — some are faster, some handle longer documents, some are better at reasoning.',
            side: 'bottom',
          },
        },
        {
          element: "[data-testid='add-multi-convo-button']",
          popover: {
            title: 'Compare Chats',
            description:
              'Opens a second conversation side-by-side so you can compare how two models (or two prompts) respond to the same question.',
            side: 'bottom',
          },
        },
        {
          element: "[data-testid='bookmark-menu']",
          popover: {
            title: 'Bookmarks',
            description:
              'Tag and organize conversations you want to find again quickly — useful for grouping chats by project or topic.',
            side: 'bottom',
          },
        },
        {
          element: "[data-testid='open-sidebar-button'], [data-testid='close-sidebar-button']",
          popover: {
            title: 'Sidebar Toggle',
            description:
              'Collapses or expands the sidebar to give your conversation more room, or to bring back quick access to your chats, agents, and settings.',
            side: 'right',
          },
        },
        {
          element: "[data-testid^='nav-panel-']",
          popover: {
            title: 'Sidebar Panels',
            description:
              'Each icon switches the sidebar to a different panel — your conversation history, prompts, agents, memories, bookmarks, files, and more, all in the same space.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-agents-marketplace-button']",
          popover: {
            title: 'Agent Marketplace',
            description:
              'Browse pre-built agents created for specific tasks — no setup required, just pick one and start chatting.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-search-input']",
          popover: {
            title: 'Search Conversations',
            description:
              'Search across all of your past conversations by keyword — handy once you have more than a handful of chats.',
            side: 'bottom',
          },
        },
        {
          element: "[data-testid='nav-projects-section']",
          popover: {
            title: 'Projects',
            description:
              'Group related conversations into a project folder to keep long-running work organized and easy to find later.',
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
          element: "[data-testid='attach-file-menu-button']",
          popover: {
            title: 'Attach Files',
            description:
              'Upload images or documents for the model to read — useful for asking questions about a specific file, spreadsheet, or image.',
            side: 'top',
          },
        },
        {
          element: "[data-testid^='toolbar-toggle-']",
          popover: {
            title: 'Feature Toggles',
            description:
              'Turn on extra capabilities for this message — Code Interpreter, Web Search, Skills, Artifacts, Memory, File Search, or MCP connectors. Only the ones enabled for your account will show up here.',
            side: 'top',
          },
        },
        {
          element: "[data-testid='audio-recorder-button']",
          popover: {
            title: 'Voice Input',
            description:
              'Dictate your message instead of typing it — click once to start recording, click again to stop.',
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
          element: "[data-testid='nav-user']",
          popover: {
            title: 'Account Menu',
            description: 'Access your profile, settings, theme, and sign-out option from here.',
            side: 'top',
          },
        },
      ],
    });

    tourDriver.drive();
  }, [localize, onComplete]);

  return { startTour };
}
