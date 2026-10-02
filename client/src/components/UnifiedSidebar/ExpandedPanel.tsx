import { memo, useCallback, lazy, Suspense } from 'react';
import { useRecoilValue } from 'recoil';
import * as Menu from '@ariakit/react/menu';
import { useNavigate } from 'react-router-dom';
import { BookOpen, MessageCircleQuestion, MessageSquareHeart, SquarePen } from 'lucide-react';
import { QueryKeys, PermissionBits } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton, Sidebar, Button, TooltipAnchor } from '@librechat/client';
import type { NavLink } from '~/common';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { useActivePanel, resolveActivePanel, DEFAULT_PANEL } from '~/Providers';
import { CLOSE_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useLearningTour } from '~/components/Learning/LearningTourContext';
import { useMarketplaceAgentsInfiniteQuery } from '~/data-provider/Agents/queries';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));
const FAQ_AGENT_NAME = 'MyAssist FAQs';
const FEEDBACK_URL = 'https://forms.cloud.microsoft/e/E9AyvN4Ayx';

function LearningMenu({ link }: { link: NavLink }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { startGettingStartedTour } = useLearningTour();
  const { data } = useMarketplaceAgentsInfiniteQuery({
    requiredPermission: PermissionBits.VIEW,
    search: FAQ_AGENT_NAME,
    limit: 50,
  });
  const faqAgent = data?.pages
    .flatMap((page) => page.data)
    .find((item) => item.name?.toLowerCase() === FAQ_AGENT_NAME.toLowerCase());

  const openFaqAgent = () => {
    if (faqAgent) {
      navigate(`/c/new?agent_id=${encodeURIComponent(faqAgent.id)}`);
    }
  };

  return (
    <Menu.MenuProvider placement="right-end">
      <Menu.MenuButton
        id="nav-panel-learning"
        aria-label={localize(link.title)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt"
      >
        <link.icon className="h-5 w-5" aria-hidden="true" />
      </Menu.MenuButton>
      <Menu.Menu
        portal
        gutter={12}
        className="account-settings-popover popover-ui z-[125] w-[244px] rounded-lg"
      >
        <Menu.MenuItem onClick={startGettingStartedTour} className="select-item text-sm">
          <BookOpen className="icon-md" aria-hidden="true" />
          {localize('com_learning_take_guided_tutorial')}
        </Menu.MenuItem>
        {faqAgent && (
          <Menu.MenuItem onClick={openFaqAgent} className="select-item text-sm">
            <MessageCircleQuestion className="icon-md" aria-hidden="true" />
            {localize('com_learning_ask_faq_agent')}
          </Menu.MenuItem>
        )}
        <Menu.MenuItem
          onClick={() => window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer')}
          className="select-item text-sm"
        >
          <MessageSquareHeart className="icon-md" aria-hidden="true" />
          {localize('com_learning_give_feedback')}
        </Menu.MenuItem>
      </Menu.Menu>
    </Menu.MenuProvider>
  );
}

const NewChatButton = memo(function NewChatButton({
  setActive,
}: {
  setActive: (id: string) => void;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversationId = useRecoilValue(store.conversationIdByIndex(0));
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);
  const tooltipDescription = useShortcutHint('newChat', localize('com_ui_new_chat'));
  const ariaKey = useShortcutAriaKey('newChat');

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        clearMessagesCache(queryClient, conversationId);
        queryClient.invalidateQueries([QueryKeys.messages]);
        newConversation();
        if (switchToHistory) {
          setActive(DEFAULT_PANEL);
        }
      }
    },
    [queryClient, conversationId, newConversation, switchToHistory, setActive],
  );

  return (
    <TooltipAnchor
      side="right"
      description={tooltipDescription}
      render={
        <a
          href="/c/new"
          id="new-chat-button"
          data-testid="new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          aria-keyshortcuts={ariaKey}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
          onClick={handleClick}
        >
          <SquarePen className="h-5 w-5 text-text-primary" />
        </a>
      }
    />
  );
});

const NavIconButton = memo(function NavIconButton({
  link,
  isActive,
  expanded,
  setActive,
  onExpand,
  onCollapse,
}: {
  link: NavLink;
  isActive: boolean;
  expanded: boolean;
  setActive: (id: string) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const localize = useLocalize();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (link.onClick) {
        link.onClick(e);
        return;
      }
      if (isActive && expanded) {
        onCollapse?.();
        return;
      }
      if (!isActive) {
        setActive(link.id);
      }
      if (!expanded) {
        onExpand?.();
      }
    },
    [link, isActive, setActive, expanded, onExpand, onCollapse],
  );

  return (
    <TooltipAnchor
      description={localize(link.title)}
      side="right"
      render={
        <Button
          id={`nav-panel-${link.id}`}
          data-testid={`nav-panel-${link.id}`}
          size="icon"
          variant="ghost"
          aria-label={localize(link.title)}
          aria-pressed={isActive}
          className={cn(
            'h-9 w-9 rounded-lg',
            isActive ? 'bg-surface-active-alt text-text-primary' : 'text-text-secondary',
          )}
          onClick={handleClick}
        >
          <link.icon className="h-5 w-5" aria-hidden="true" />
        </Button>
      }
    />
  );
});

function ExpandedPanel({
  links,
  expanded = true,
  onCollapse,
  onExpand,
}: {
  links: NavLink[];
  expanded?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const { active, setActive } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);

  const toggleLabel = expanded ? 'com_nav_close_sidebar' : 'com_nav_open_sidebar';
  const toggleClick = expanded ? onCollapse : onExpand;
  const toggleSidebarHint = useShortcutHint('toggleSidebar', localize(toggleLabel));
  const toggleSidebarAriaKey = useShortcutAriaKey('toggleSidebar');

  return (
    <div className="flex h-full flex-shrink-0 flex-col gap-2 border-r border-border-light bg-surface-primary-alt px-2 py-2">
      <TooltipAnchor
        side="right"
        description={toggleSidebarHint}
        render={
          <Button
            id={expanded ? CLOSE_SIDEBAR_ID : 'open-sidebar-button'}
            data-testid={expanded ? 'close-sidebar-button' : 'open-sidebar-button'}
            size="icon"
            variant="ghost"
            aria-label={localize(toggleLabel)}
            aria-expanded={expanded}
            aria-keyshortcuts={toggleSidebarAriaKey}
            className="h-9 w-9 rounded-lg"
            onClick={toggleClick}
          >
            <Sidebar aria-hidden="true" className="h-5 w-5 text-text-primary" />
          </Button>
        }
      />
      <NewChatButton setActive={setActive} />
      <div className="mx-2 border-b border-border-light" />
      {/* Deloitte Custom Change: Learning Hub is pinned to the bottom group
          (directly above the account settings icon) so exclude it here */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {links
          .filter((link) => link.id !== 'learning')
          .map((link) => (
            <NavIconButton
              key={link.id}
              link={link}
              isActive={link.id === effectiveActive}
              expanded={expanded ?? true}
              setActive={setActive}
              onExpand={onExpand}
              onCollapse={onCollapse}
            />
          ))}
      </div>

      {/* Deloitte Custom Change: Learning Hub pinned directly above the account
          settings icon rather than floating at the end of the scrollable list
          with a large mt-auto gap between them */}
      <div className="mt-auto flex flex-col gap-1">
        {links.find((link) => link.id === 'learning') && (
          <LearningMenu link={links.find((link) => link.id === 'learning')!} />
        )}
        <Suspense fallback={<Skeleton className="h-9 w-9 rounded-lg" />}>
          <AccountSettings collapsed />
        </Suspense>
      </div>
    </div>
  );
}

export default memo(ExpandedPanel);
