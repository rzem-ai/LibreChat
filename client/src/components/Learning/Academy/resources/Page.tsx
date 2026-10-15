import type { GEL } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { Resource } from '../../content/schema';
import { useLearningTour } from '../../LearningTourContext';
import { RESOURCES } from '../../content/data';
import { ResourceCard } from '../../cards';
import Searchable from '../Searchable';
import { useLocalize } from '~/hooks';

interface ResourcesProps {
  onOpenArticle: (slug: string) => void;
}

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

export default function Resources({ onOpenArticle }: ResourcesProps): JSX.Element {
  const localize = useLocalize();
  const { startGettingStartedTour } = useLearningTour();
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
    const onSelect =
      resource.type === 'article' ? () => onOpenArticle(resource.id) : startGettingStartedTour;

    return (
      <ResourceCard
        key={resource.id}
        title={resource.title}
        description={resource.description}
        icon={resourceIcons[resource.type]}
        metaLabel={metaLabel}
        actionLabel={actionLabel}
        externalHref={resource.externalHref}
        onSelect={onSelect}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(renderResource)}
        </div>
      )}
    </Searchable>
  );
}
