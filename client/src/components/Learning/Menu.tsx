import { useId, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useNavigate } from 'react-router-dom';
import { DropdownPopup, gelIcons } from '@librechat/client';
import type { NavLink } from '~/common';
import type * as t from '~/common';
import { useAskFaqAgent, useLearningCenterConfig } from '~/hooks/Learning';
import { useLearningTour } from './LearningTourContext';
import { useLocalize } from '~/hooks';

export default function Menu({ link }: { link: NavLink }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { startGettingStartedTour } = useLearningTour();
  const { feedbackUrl } = useLearningCenterConfig();
  const { faqAgent, askFaqAgent } = useAskFaqAgent();

  const items: t.MenuItemProps[] = [
    {
      id: 'learning-guided-tutorial',
      label: localize('com_learning_take_guided_tutorial'),
      icon: <gelIcons.guide className="icon-md" aria-hidden="true" />,
      onClick: startGettingStartedTour,
    },
    {
      id: 'learning-ask-faq-agent',
      label: localize('com_learning_ask_faq_agent', { 0: faqAgent?.name ?? '' }),
      icon: <gelIcons.agent className="icon-md" aria-hidden="true" />,
      show: !!faqAgent,
      onClick: askFaqAgent,
    },
    {
      id: 'learning-explore-academy',
      label: localize('com_learning_explore_academy'),
      icon: <gelIcons.academy className="icon-md" aria-hidden="true" />,
      onClick: () => navigate('/learning'),
    },
    {
      id: 'learning-give-feedback',
      label: localize('com_learning_give_feedback'),
      icon: <gelIcons.feedback className="icon-md" aria-hidden="true" />,
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
