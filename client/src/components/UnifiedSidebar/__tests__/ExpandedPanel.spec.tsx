import React from 'react';
import { RecoilRoot } from 'recoil';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom/extend-expect';
import { MessagesSquare, NotebookPen } from 'lucide-react';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MutableSnapshot } from 'recoil';
import type { NavLink } from '~/common';
import { ActivePanelProvider, DEFAULT_PANEL } from '~/Providers';

const mockNewConversation = jest.fn();
const mockClearMessagesCache = jest.fn();
const mockStartGettingStartedTour = jest.fn();
const mockGetAgentById = jest.fn();
const FAQ_AGENT_ID = 'agent_faq-agent-id';
const FEEDBACK_URL = 'https://forms.cloud.microsoft/e/E9AyvN4Ayx';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, getAgentById: () => mockGetAgentById() },
  };
});

jest.mock('~/components/Learning/LearningTourContext', () => ({
  useLearningTour: () => ({ startGettingStartedTour: mockStartGettingStartedTour }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data: { interface: { learningCenter: { faqAgentId: FAQ_AGENT_ID, feedbackUrl: FEEDBACK_URL } } },
  }),
}));

jest.mock('~/store', () => {
  const { atom } = jest.requireActual('recoil');
  let counter = 0;
  const switchAtom = atom({
    key: 'mock-newChatSwitchToHistory',
    default: true,
  });
  const customShortcutsAtom = atom({
    key: 'mock-customShortcuts',
    default: {},
  });
  const shortcutsEnabledAtom = atom({
    key: 'mock-shortcutsEnabled',
    default: true,
  });
  return {
    __esModule: true,
    default: {
      conversationByIndex: () =>
        atom({ key: `mock-conversationByIndex-${counter++}`, default: null }),
      conversationIdByIndex: () =>
        atom({ key: `mock-conversationIdByIndex-${counter++}`, default: null }),
      newChatSwitchToHistory: switchAtom,
      customShortcuts: customShortcutsAtom,
      shortcutsEnabled: shortcutsEnabledAtom,
    },
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNewConvo: () => ({ newConversation: mockNewConversation }),
  useShowMarketplace: () => false,
}));

/**
 * Stands in for the real hook, which reaches `useNewConvo` by deep path and so
 * escapes the `~/hooks` mock above. Mirrors its contract closely enough that
 * the panel-switch assertions still exercise the `onNewChat` wiring.
 */
jest.mock('~/hooks/Chat/useNewChat', () => ({
  __esModule: true,
  default: ({ onNewChat }: { onNewChat?: () => void } = {}) => ({
    newConversation: mockNewConversation,
    startNewChat: () => {
      mockNewConversation();
      onNewChat?.();
    },
    handleNewChatClick: (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      mockClearMessagesCache();
      mockNewConversation();
      onNewChat?.();
    },
  }),
}));

jest.mock('~/utils', () => ({
  clearMessagesCache: (...args: unknown[]) => mockClearMessagesCache(...args),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  CLOSE_SIDEBAR_ID: 'close-sidebar-button',
}));

jest.mock('~/components/Nav/AccountSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="account-settings" />,
}));

import ExpandedPanel from '../ExpandedPanel';
import store from '~/store';

const createLinks = (): NavLink[] => [
  {
    title: 'com_ui_chat_history' as const,
    icon: MessagesSquare,
    id: DEFAULT_PANEL,
  },
  {
    title: 'com_ui_prompts' as const,
    icon: NotebookPen,
    id: 'prompts',
  },
  {
    title: 'com_ui_learning_hub' as const,
    icon: NotebookPen,
    id: 'learning',
  },
];

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderPanel({
  expanded = true,
  links = createLinks(),
  onCollapse = jest.fn(),
  onExpand = jest.fn(),
  onNavigate,
  initialPanel = DEFAULT_PANEL,
  initializeState,
}: {
  expanded?: boolean;
  links?: NavLink[];
  onCollapse?: jest.Mock;
  onExpand?: jest.Mock;
  onNavigate?: jest.Mock;
  initialPanel?: string;
  initializeState?: (snapshot: MutableSnapshot) => void;
} = {}) {
  if (initialPanel !== DEFAULT_PANEL) {
    localStorage.setItem('side:active-panel', initialPanel);
  }

  const result = render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <RecoilRoot initializeState={initializeState}>
          <ActivePanelProvider>
            <ExpandedPanel
              links={links}
              expanded={expanded}
              onCollapse={onCollapse}
              onExpand={onExpand}
              onNavigate={onNavigate}
            />
            <LocationDisplay />
          </ActivePanelProvider>
        </RecoilRoot>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return { ...result, onCollapse, onExpand };
}

describe('ExpandedPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockGetAgentById.mockResolvedValue({ id: FAQ_AGENT_ID, name: 'MyAssist FAQs' });
  });

  afterEach(() => jest.restoreAllMocks());

  describe('NavIconButton collapse toggle', () => {
    it('collapses sidebar when clicking the active icon while expanded', () => {
      const { onCollapse } = renderPanel({ expanded: true });
      const activeButton = screen.getByRole('button', { name: 'com_ui_chat_history' });
      fireEvent.click(activeButton);
      expect(onCollapse).toHaveBeenCalledTimes(1);
    });

    it('switches panel when clicking an inactive icon while expanded', () => {
      const { onCollapse } = renderPanel({ expanded: true });
      const inactiveButton = screen.getByRole('button', { name: 'com_ui_prompts' });
      fireEvent.click(inactiveButton);
      expect(onCollapse).not.toHaveBeenCalled();
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
    });

    it('expands sidebar when clicking any icon while collapsed', () => {
      const { onExpand } = renderPanel({ expanded: false });
      const activeButton = screen.getByRole('button', { name: 'com_ui_chat_history' });
      fireEvent.click(activeButton);
      expect(onExpand).toHaveBeenCalledTimes(1);
    });

    it('sets active panel and expands when clicking an inactive icon while collapsed', () => {
      const { onExpand } = renderPanel({ expanded: false });
      const inactiveButton = screen.getByRole('button', { name: 'com_ui_prompts' });
      fireEvent.click(inactiveButton);
      expect(onExpand).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
    });

    it('notifies mobile navigation after a route link is selected', () => {
      const onClick = jest.fn();
      const onNavigate = jest.fn();
      const links = [
        ...createLinks(),
        {
          title: 'com_insights_navigation' as const,
          icon: NotebookPen,
          id: 'insights',
          onClick,
        },
      ];

      renderPanel({ links, onNavigate });
      fireEvent.click(screen.getByRole('button', { name: 'com_insights_navigation' }));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('NewChatButton panel switch', () => {
    it('switches to chat history panel on new chat click when setting is enabled', () => {
      renderPanel({ expanded: true, initialPanel: 'prompts' });

      const newChatLink = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatLink);

      expect(mockNewConversation).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe(DEFAULT_PANEL);
    });

    it('does not switch panel on new chat click when setting is disabled', () => {
      renderPanel({
        expanded: true,
        initialPanel: 'prompts',
        initializeState: ({ set }: MutableSnapshot) => {
          set(store.newChatSwitchToHistory, false);
        },
      });

      const newChatLink = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatLink);

      expect(mockNewConversation).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
    });
  });

  it('renders stable ids for the sidebar toggle and panel buttons', () => {
    renderPanel({ expanded: true });

    expect(screen.getByRole('button', { name: 'com_nav_close_sidebar' })).toHaveAttribute(
      'id',
      'close-sidebar-button',
    );
    expect(screen.getByRole('button', { name: 'com_ui_chat_history' })).toHaveAttribute(
      'id',
      'nav-panel-conversations',
    );
    expect(screen.getByRole('button', { name: 'com_ui_prompts' })).toHaveAttribute(
      'id',
      'nav-panel-prompts',
    );
  });

  it('switches the toggle button id when the sidebar is collapsed', () => {
    renderPanel({ expanded: false });

    expect(screen.getByRole('button', { name: 'com_nav_open_sidebar' })).toHaveAttribute(
      'id',
      'open-sidebar-button',
    );
  });

  it('opens the Learn menu on click, not hover, and starts the guided tutorial', async () => {
    renderPanel();

    const learnButton = screen.getByRole('button', { name: 'com_ui_learning_hub' });
    fireEvent.mouseEnter(learnButton);
    expect(
      screen.queryByRole('menuitem', { name: 'com_learning_take_guided_tutorial' }),
    ).not.toBeInTheDocument();
    fireEvent.click(learnButton);
    expect(screen.getByText('com_learning_take_guided_tutorial')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('com_learning_ask_faq_agent')).toBeInTheDocument());
    expect(screen.getByText('com_learning_give_feedback')).toBeInTheDocument();

    fireEvent.click(screen.getByText('com_learning_take_guided_tutorial'));
    expect(mockStartGettingStartedTour).toHaveBeenCalledTimes(1);
  });

  it('closes the Learn menu on a second click', async () => {
    renderPanel();
    const learnButton = screen.getByRole('button', { name: 'com_ui_learning_hub' });

    fireEvent.click(learnButton);
    expect(
      screen.getByRole('menuitem', { name: 'com_learning_take_guided_tutorial' }),
    ).toBeInTheDocument();
    fireEvent.click(learnButton);
    await waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { name: 'com_learning_take_guided_tutorial' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('opens the configured FAQ agent chat by id', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_learning_hub' }));
    await waitFor(() => expect(screen.getByText('com_learning_ask_faq_agent')).toBeInTheDocument());
    fireEvent.click(screen.getByText('com_learning_ask_faq_agent'));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/c/new?agent_id=${FAQ_AGENT_ID}`),
    );
  });

  it('hides the Ask FAQ Agent item entirely when no agent resolves', async () => {
    mockGetAgentById.mockRejectedValue(new Error('Unavailable'));
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_learning_hub' }));
    await act(async () => {});
    expect(screen.getByText('com_learning_take_guided_tutorial')).toBeInTheDocument();
    expect(screen.queryByText('com_learning_ask_faq_agent')).not.toBeInTheDocument();
  });

  it('opens the feedback form in a new tab', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_learning_hub' }));
    fireEvent.click(screen.getByText('com_learning_give_feedback'));

    expect(open).toHaveBeenCalledWith(
      FEEDBACK_URL,
      '_blank',
      'noopener,noreferrer',
    );
  });
});
