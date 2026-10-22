import type { GEL } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { Resource, ResourceSection } from '../../content/schema';
import type { TranslationKeys } from '~/hooks';
import { useLearningTour } from '../../LearningTourContext';
import { RESOURCE_SECTIONS } from '../../content/schema';
import { RESOURCES } from '../../content/data';
import { ResourceCard } from '../../cards';
import Searchable from '../Searchable';
import { useLocalize } from '~/hooks';

const getFields = (resource: Resource): string[] => [
  resource.title,
  resource.description,
  ...resource.tags,
];

const resourceIcons: Record<Resource['type'], GEL.IconName> = {
  tour: 'tour',
  article: 'article',
  external: 'external',
};

const sectionLabels: Record<ResourceSection, TranslationKeys> = {
  start: 'com_learning_section_start',
  guides: 'com_learning_section_guides',
  further: 'com_learning_section_further',
  reference: 'com_learning_section_reference',
  external: 'com_learning_section_external',
};

export default function Resources(): JSX.Element {
  const localize = useLocalize();
  const { startCourseTour } = useLearningTour();
  const typeLabels = {
    tour: localize('com_learning_type_tour'),
    article: localize('com_learning_type_article'),
    external: localize('com_learning_type_external'),
  };

  const renderResource = (resource: Resource): JSX.Element => {
    const metaLabel = resource.durationLabel
      ? `${typeLabels[resource.type]} · ${resource.durationLabel}`
      : typeLabels[resource.type];
    const actionLabel = {
      tour: localize('com_learning_action_start_tour', { 0: resource.title }),
      article: localize('com_learning_action_read', { 0: resource.title }),
      external: localize('com_learning_action_external', { 0: resource.title }),
    }[resource.type];

    return (
      <ResourceCard
        key={resource.id}
        title={resource.title}
        description={resource.description}
        icon={resourceIcons[resource.type]}
        metaLabel={metaLabel}
        actionLabel={actionLabel}
        externalHref={resource.externalHref}
        to={resource.type === 'article' ? `/learn/articles/${resource.id}` : undefined}
        onSelect={resource.type === 'tour' ? () => startCourseTour(resource.id) : undefined}
      />
    );
  };

  return (
    <Searchable
      items={RESOURCES}
      getFields={getFields}
      searchLabel={localize('com_learning_search_resources')}
      renderEmpty={(query) => localize('com_learning_no_resources', { 0: query })}
    >
      {(visible) => (
        <div className="flex flex-col gap-8">
          {RESOURCE_SECTIONS.map((section) => {
            const inSection = visible.filter((resource) => resource.section === section);
            if (inSection.length === 0) {
              return null;
            }
            return (
              <section key={section} className="flex flex-col gap-4">
                <h2 className="text-xl font-medium">{localize(sectionLabels[section])}</h2>
                <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {inSection.map(renderResource)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Searchable>
  );
}
