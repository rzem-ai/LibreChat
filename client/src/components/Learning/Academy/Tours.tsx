import { TourCard } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { CourseContent } from '../content/schema';
import useTourProgress, { getTourStatus } from '../progress';
import { useLearningTour } from '../LearningTourContext';
import { TOURS } from '../content/registry';
import { useLocalize } from '~/hooks';

export default function Tours(): JSX.Element {
  const localize = useLocalize();
  const { startGettingStartedTour } = useLearningTour();
  const { progressById } = useTourProgress();
  const hero = TOURS.find((tour) => tour.isGettingStartedTour);
  const rest = TOURS.filter((tour) => tour !== hero);

  const renderTour = (tour: CourseContent, isHero = false): JSX.Element => {
    const { status, percent } = getTourStatus(progressById[tour.id]);
    const statusLabel = {
      complete: localize('com_learning_status_complete'),
      'in-progress': localize('com_learning_status_in_progress', { 0: percent ?? 0 }),
      'not-started': localize('com_learning_status_not_started'),
    }[status];
    const ctaLabel = {
      complete: localize('com_learning_tour_restart'),
      'in-progress': localize('com_learning_tour_continue'),
      'not-started': localize('com_learning_start_tour'),
    }[status];

    return (
      <TourCard
        key={tour.id}
        hero={isHero}
        title={tour.title}
        description={tour.description}
        status={status}
        statusLabel={tour.comingSoon ? localize('com_learning_coming_soon') : statusLabel}
        ctaLabel={tour.comingSoon ? localize('com_learning_coming_soon') : ctaLabel}
        disabled={tour.comingSoon}
        onStart={startGettingStartedTour}
      />
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {hero && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-medium">
            {localize('com_learning_start_here', { 0: hero.title })}
          </h2>
          {renderTour(hero, true)}
        </section>
      )}
      {rest.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((tour) => renderTour(tour))}
        </section>
      )}
    </div>
  );
}
