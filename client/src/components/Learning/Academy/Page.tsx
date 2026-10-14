import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button, gelIcons, Tabs, TabsList, TabsTrigger, TabsContent } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import { useGetStartupConfig } from '~/data-provider';
import { useAskFaqAgent } from '~/hooks/Learning';
import Resources from './resources/Page';
import Releases from './releases/Page';
import { useLocalize } from '~/hooks';
import Tours from './tours/Page';
import Faq from './faq/Page';

type AcademyTab = 'tours' | 'resources' | 'faq' | 'releases';

const contentClass = 'mt-0 p-0';

export default function Page(): JSX.Element {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { tab = 'tours' } = useParams<{ tab: AcademyTab }>();
  const { data: startupConfig } = useGetStartupConfig();
  const { faqAgent, askFaqAgent } = useAskFaqAgent();
  const flags = startupConfig?.interface?.customDeloitteFeatureFlags;

  const tabs: { id: AcademyTab; label: string; enabled: boolean }[] = [
    { id: 'tours', label: localize('com_learning_tab_tours'), enabled: true },
    { id: 'resources', label: localize('com_learning_tab_resources'), enabled: true },
    {
      id: 'faq',
      label: localize('com_learning_tab_faq'),
      enabled: flags?.learningCommonQuestions === true,
    },
    {
      id: 'releases',
      label: localize('com_learning_tab_releases'),
      enabled: flags?.learningReleaseNotes === true,
    },
  ];
  const enabledTabs = tabs.filter((candidate) => candidate.enabled);

  const isConfigSettled = startupConfig !== undefined;
  if (isConfigSettled && !enabledTabs.some((candidate) => candidate.id === tab)) {
    return <Navigate to="/learning/tours" replace />;
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight">
            {localize('com_learning_academy_title')}
          </h1>
          <p className="mt-1 text-text-secondary">{localize('com_learning_academy_subtitle')}</p>
        </div>
        {faqAgent && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={askFaqAgent}
          >
            <gelIcons.agent className="size-4" aria-hidden="true" />
            {localize('com_learning_ask_faq_agent', { 0: faqAgent.name ?? '' })}
          </Button>
        )}
      </header>
      <Tabs
        value={tab}
        onValueChange={(next) => navigate(`/learning/${next}`)}
        className="flex flex-col gap-6"
      >
        <TabsList variant="underline">
          {enabledTabs.map((candidate) => (
            <TabsTrigger key={candidate.id} value={candidate.id} variant="underline">
              {candidate.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="tours" className={contentClass}>
          <Tours />
        </TabsContent>
        <TabsContent value="resources" className={contentClass}>
          <Resources onOpenArticle={(slug) => navigate(`/learning/articles/${slug}`)} />
        </TabsContent>
        <TabsContent value="faq" className={contentClass}>
          <Faq />
        </TabsContent>
        <TabsContent value="releases" className={contentClass}>
          <Releases />
        </TabsContent>
      </Tabs>
    </>
  );
}
