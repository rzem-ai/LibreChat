import { useMemo, useState } from 'react';
import { FilterInput, ResourceCard } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { Resource } from '../content/schema';
import { useLearningTour } from '../LearningTourContext';
import { RESOURCES } from '../content/data';
import { matchesQuery } from './search';
import { useLocalize } from '~/hooks';

interface ResourcesProps {
  onOpenArticle: (slug: string) => void;
}

export default function Resources({ onOpenArticle }: ResourcesProps): JSX.Element {
  const localize = useLocalize();
  const { startGettingStartedTour } = useLearningTour();
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () =>
      RESOURCES.filter((resource) =>
        matchesQuery(query, [resource.title, resource.description, ...resource.tags]),
      ),
    [query],
  );

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
      resource.type === 'article' && resource.articleSlug
        ? () => onOpenArticle(resource.articleSlug as string)
        : startGettingStartedTour;

    return (
      <ResourceCard
        key={resource.id}
        title={resource.title}
        description={resource.description}
        icon={resource.icon}
        metaLabel={metaLabel}
        actionLabel={actionLabel}
        externalHref={resource.externalHref}
        onSelect={onSelect}
      />
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <FilterInput
        inputId="learning-resources-search"
        label={localize('com_learning_search_resources')}
        containerClassName="max-w-sm"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {visible.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {localize('com_learning_no_resources', { 0: query })}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(renderResource)}
        </div>
      )}
    </div>
  );
}
