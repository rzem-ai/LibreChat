import { useId, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useNavigate } from 'react-router-dom';
import { DropdownPopup } from '@librechat/client';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { BookOpen, GraduationCap, MessageCircleQuestion, MessageSquareHeart } from 'lucide-react';
import type { NavLink } from '~/common';
import type * as t from '~/common';
import { useLearningTour } from '~/components/Learning/LearningTourContext';
import { useFaqAgent, useLearningCenterConfig } from '~/hooks/Learning';
import useDefaultConvo from '~/hooks/Conversations/useDefaultConvo';
import { useLocalize, useNewConvo } from '~/hooks';
import { specDisplayFieldReset } from '~/utils';

export default function LearningMenu({ link }: { link: NavLink }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { newConversation } = useNewConvo();
  const getDefaultConversation = useDefaultConvo();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { startGettingStartedTour } = useLearningTour();
  const { faqAgentId, feedbackUrl } = useLearningCenterConfig();
  const { faqAgent } = useFaqAgent(faqAgentId);

  const items: t.MenuItemProps[] = [
    {
      id: 'learning-guided-tutorial',
      label: localize('com_learning_take_guided_tutorial'),
      icon: <BookOpen className="icon-md" aria-hidden="true" />,
      onClick: startGettingStartedTour,
    },
    {
      id: 'learning-ask-faq-agent',
      label: localize('com_learning_ask_faq_agent', { 0: faqAgent?.name ?? '' }),
      icon: <MessageCircleQuestion className="icon-md" aria-hidden="true" />,
      show: !!faqAgent,
      onClick: () => {
        if (!faqAgent) {
          return;
        }
        const template = {
          conversationId: Constants.NEW_CONVO as string,
          endpoint: EModelEndpoint.agents,
          agent_id: faqAgent.id,
          ...specDisplayFieldReset,
        };
        newConversation({
          template: getDefaultConversation({ conversation: template, preset: template }),
          preset: template,
        });
      },
    },
    {
      id: 'learning-explore-academy',
      label: localize('com_learning_explore_academy'),
      icon: <GraduationCap className="icon-md" aria-hidden="true" />,
      onClick: () => navigate('/learning'),
    },
    {
      id: 'learning-give-feedback',
      label: localize('com_learning_give_feedback'),
      icon: <MessageSquareHeart className="icon-md" aria-hidden="true" />,
      show: !!feedbackUrl,
      onClick: () => window.open(feedbackUrl, '_blank', 'noopener,noreferrer'),
    },
  ];

  return (
    <DropdownPopup
      portal
      gutter={12}
      menuId={menuId}
      isOpen={isMenuOpen}
      setIsOpen={setIsMenuOpen}
      className="w-[244px]"
      items={items}
      trigger={
        <Ariakit.MenuButton
          id="nav-panel-learning"
          aria-label={localize(link.title)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt"
        >
          <link.icon className="h-5 w-5" aria-hidden="true" />
        </Ariakit.MenuButton>
      }
    />
  );
}
