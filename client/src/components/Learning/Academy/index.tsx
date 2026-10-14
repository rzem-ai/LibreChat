import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import Resources from './Resources';
import Releases from './Releases';
import Article from './Article';
import Tours from './Tours';
import Faq from './Faq';

type AcademyTab = 'tours' | 'resources' | 'questions' | 'releases';

export default function Academy(): JSX.Element {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { data: startupConfig } = useGetStartupConfig();
  const [tab = 'tours', slug] = (useParams()['*'] ?? '').split('/').filter(Boolean);
  const flags = startupConfig?.interface?.customDeloitteFeatureFlags;

  const tabs: { id: AcademyTab; label: string; enabled: boolean }[] = [
    { id: 'tours', label: localize('com_learning_tab_tours'), enabled: true },
    { id: 'resources', label: localize('com_learning_tab_resources'), enabled: true },
    {
      id: 'questions',
      label: localize('com_learning_tab_faq'),
      enabled: flags?.learningCommonQuestions === true,
    },
    {
      id: 'releases',
      label: localize('com_learning_tab_releases'),
      enabled: flags?.learningReleaseNotes === true,
    },
  ];

  if (!tabs.some((candidate) => candidate.id === tab && candidate.enabled)) {
    return <Navigate to="/learning/tours" replace />;
  }

  return (
    <main className="flex-1 overflow-y-auto px-10 pb-10 pt-14">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-3xl font-light tracking-tight">
            {localize('com_learning_academy_title')}
          </h1>
          <p className="mt-1 text-text-secondary">{localize('com_learning_academy_subtitle')}</p>
        </header>
        <Tabs value={tab} onValueChange={(next) => navigate(`/learning/${next}`)}>
          <TabsList className="border-b border-border-light">
            {tabs
              .filter((candidate) => candidate.enabled)
              .map((candidate) => (
                <TabsTrigger key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </TabsTrigger>
              ))}
          </TabsList>
          <TabsContent value="tours" className="mt-6">
            <Tours />
          </TabsContent>
          <TabsContent value="resources" className="mt-6">
            {slug ? (
              <Article slug={slug} onBack={() => navigate('/learning/resources')} />
            ) : (
              <Resources onOpenArticle={(next) => navigate(`/learning/resources/${next}`)} />
            )}
          </TabsContent>
          <TabsContent value="questions" className="mt-6">
            <Faq />
          </TabsContent>
          <TabsContent value="releases" className="mt-6">
            <Releases />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
