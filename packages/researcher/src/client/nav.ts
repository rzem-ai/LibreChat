import { Rss, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { registerResearchStrings } from './hooks/localize';
import { useResearchStatusQuery } from './hooks/queries';
import { ResearchPanel } from './panels/Research';
import { FeedsPanel } from './panels/Feeds';

/** A side-nav entry in the shape the host's side panel renders. */
export type ResearchNavLink = {
  title: string;
  label: string;
  icon: LucideIcon;
  id: string;
  Component: ComponentType;
};

const RESEARCH_LINKS: ReadonlyArray<ResearchNavLink> = [
  {
    title: 'com_ui_research',
    label: '',
    icon: FlaskConical,
    id: 'research',
    Component: ResearchPanel,
  },
  { title: 'com_ui_feeds', label: '', icon: Rss, id: 'feeds', Component: FeedsPanel },
];

const NO_LINKS: ReadonlyArray<ResearchNavLink> = [];

/**
 * The Research and Feeds side-panel entries, when research is enabled on the server and the
 * user can use agents. Registers the research copy so the host can localize the titles.
 */
export function useResearchNavLinks(canUseAgents: boolean): ReadonlyArray<ResearchNavLink> {
  const { i18n } = useTranslation();
  registerResearchStrings(i18n);
  const { data } = useResearchStatusQuery({ enabled: canUseAgents });
  return canUseAgents && data?.enabled === true ? RESEARCH_LINKS : NO_LINKS;
}
