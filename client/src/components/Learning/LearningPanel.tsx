import { Clock, Lightbulb, ArrowRight } from 'lucide-react';
import { COURSES, type LearningCourse } from './courses';
import { useLearningTour } from './LearningTourContext';
import { useLocalize } from '~/hooks';

const activeCourses = COURSES.filter((course) => !course.comingSoon);
const comingSoonCourses = COURSES.filter((course) => course.comingSoon);

function CourseHeroCard({ course, onSelect }: { course: LearningCourse; onSelect: () => void }) {
  const localize = useLocalize();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-light bg-surface-secondary p-4">
      <div className="flex size-8 items-center justify-center rounded-lg bg-surface-tertiary">
        <Lightbulb className="size-4 text-text-secondary" />
      </div>
      <p className="text-sm font-semibold text-text-primary">{course.title}</p>
      <p className="text-xs leading-relaxed text-text-secondary">{course.description}</p>
      <div className="mt-1 flex items-center justify-between">
        {course.estimatedMinutes != null && (
          <span className="flex items-center gap-1 text-xs tabular-nums text-text-tertiary">
            <Clock className="size-3" />
            {localize(
              course.estimatedMinutes === 1
                ? 'com_learning_estimated_minutes'
                : 'com_learning_estimated_minutes_plural',
              { 0: course.estimatedMinutes },
            )}
          </span>
        )}
        <button
          type="button"
          onClick={onSelect}
          data-testid={`learning-course-row-${course.id}`}
          className="flex items-center gap-1.5 rounded-md bg-surface-submit px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-surface-submit-hover"
        >
          {localize('com_learning_start_tour')}
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ComingSoonRow({ course, isFirst }: { course: LearningCourse; isFirst: boolean }) {
  return (
    <div
      data-testid={`learning-course-row-${course.id}`}
      className={`flex items-center gap-2 px-1 py-2 ${isFirst ? '' : 'border-t border-border-light'}`}
    >
      <Lightbulb className="size-4 shrink-0 text-text-tertiary" />
      <p className="min-w-0 flex-1 truncate text-sm text-text-tertiary">{course.title}</p>
      <span className="shrink-0 text-xs text-text-tertiary">{course.description}</span>
    </div>
  );
}

export default function LearningPanel() {
  const localize = useLocalize();
  const { startGettingStartedTour } = useLearningTour();

  return (
    <div data-testid="learning-panel" className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {activeCourses.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {localize('com_learning_courses_title')}
            </p>
            {activeCourses.map((course) => (
              <CourseHeroCard key={course.id} course={course} onSelect={startGettingStartedTour} />
            ))}
          </div>
        )}

        {comingSoonCourses.length > 0 && (
          <div className="flex flex-col">
            {comingSoonCourses.map((course, index) => (
              <ComingSoonRow key={course.id} course={course} isFirst={index === 0} />
            ))}
          </div>
        )}

        {comingSoonCourses.length > 0 && (
          <p className="mt-2 text-center text-xs text-text-tertiary">
            {localize('com_learning_coming_soon')}
          </p>
        )}
      </div>
    </div>
  );
}
