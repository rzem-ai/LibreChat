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
        // Driver.js calls this for every way a tour ends — Escape, the close
        // button, an overlay click, or finishing the last step — with no
        // built-in signal distinguishing "cancelled" from "finished". Check
        // whether we were on the last step before destroying, so cancelling
        // partway through never fires the completion popup.
        const finishedTour = tourDriver.isLastStep();
        tourDriver.destroy();
        if (finishedTour) {
          onComplete?.();
        }
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
            title: 'Bookmark This Chat',
            description:
              'Tag the current conversation so you can find it again quickly — useful for grouping chats by project or topic.',
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
          element: "[data-testid='nav-panel-conversations']",
          popover: {
            title: 'Conversations',
            description:
              'The default panel — your chat history, search, and projects all live here.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-agents']",
          popover: {
            title: 'Agent Builder',
            description:
              'Create and configure your own custom agents — give them instructions, tools, and knowledge tailored to a specific job.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-skills']",
          popover: {
            title: 'Skills',
            description:
              'Manage reusable knowledge documents you can attach to agents or pull into a message.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-prompts']",
          popover: {
            title: 'Prompts',
            description:
              'Save prompt templates you use often, then trigger them in chat with a /command instead of retyping them.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-memories']",
          popover: {
            title: 'Memories',
            description:
              'Review and manage what the assistant remembers about you across conversations.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-bookmarks']",
          popover: {
            title: 'Bookmarks',
            description:
              'Browse every conversation you have tagged, grouped by your own bookmark labels.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-files']",
          popover: {
            title: 'Files',
            description:
              'See every file you have uploaded across all your conversations in one place.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-parameters']",
          popover: {
            title: 'Parameters',
            description:
              'Fine-tune model settings like temperature and max tokens for the current conversation.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-mcp-builder']",
          popover: {
            title: 'MCP Connectors',
            description: 'Configure and manage Model Context Protocol server connections.',
            side: 'right',
          },
        },
        {
          element: "[data-testid='nav-panel-learning']",
          popover: {
            title: 'Learning Hub',
            description:
              "You're here right now! Come back any time to replay this tour or check for new ones.",
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
          element: "[data-testid='toolbar-toggle-code-interpreter']",
          popover: {
            title: 'Run Code',
            description:
              'Lets the model write and execute real code (Python, JS, and more) to solve a problem — great for calculations, data processing, or generating a chart.',
            side: 'top',
          },
        },
        {
          element: "[data-testid='toolbar-toggle-skills']",
          popover: {
            title: 'Skills',
            description:
              'Attaches a reusable knowledge document to this message — use it to give the model reference material or instructions specific to a task.',
            side: 'top',
          },
        },
        {
          element: "[data-testid='toolbar-toggle-artifacts']",
          popover: {
            title: 'Artifacts',
            description:
              'Renders code, documents, or diagrams the model produces in a dedicated side panel instead of inline in the chat — handy for reviewing or iterating on longer outputs.',
            side: 'top',
          },
        },
        {
          element:
            "[data-testid='toolbar-toggle-web-search'], [data-testid='toolbar-toggle-memory'], [data-testid='toolbar-toggle-file-search'], [data-testid='toolbar-toggle-mcp-servers']",
          popover: {
            title: 'More Toggles',
            description:
              'A few more capabilities live here too — Web Search, Memory, File Search, and MCP connectors. Only the ones enabled for your account will show up.',
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
