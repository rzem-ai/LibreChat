import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Hourglass, GraduationCap, ChevronRight } from 'lucide-react';
import { COURSES, type LearningCourse } from './courses';
import useLandingPageTour from './useLandingPageTour';
import DiffPopoverButton from './DiffPopover';
import { useActivePanel } from '~/Providers';
import RatingStars from './RatingStars';
import { useLocalize } from '~/hooks';

const activeCourses = COURSES.filter((course) => !course.comingSoon);
const comingSoonCourses = COURSES.filter((course) => course.comingSoon);

function CourseRow({ course, onSelect }: { course: LearningCourse; onSelect: () => void }) {
  const localize = useLocalize();
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`learning-course-row-${course.id}`}
      className="flex w-full items-center gap-3 rounded-xl border border-border-light bg-surface-primary px-3 py-3 text-left transition-colors hover:border-border-medium hover:bg-surface-hover"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
        <GraduationCap className="h-4 w-4 text-text-secondary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-text-primary">
          {localize(course.titleKey)}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-text-tertiary">
          {localize(course.descriptionKey)}
        </p>
        {course.estimatedMinutes != null && (
          <span className="mt-1.5 flex items-center gap-1 text-[10px] text-text-tertiary">
            <Clock className="h-3 w-3" />
            {localize('com_learning_estimated_minutes', { 0: course.estimatedMinutes })}
          </span>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
    </button>
  );
}

function ComingSoonRow({ course }: { course: LearningCourse }) {
  const localize = useLocalize();
  return (
    <div
      data-testid={`learning-course-row-${course.id}`}
      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border-light bg-surface-secondary/50 px-3 py-3 opacity-60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary">
        <Hourglass className="h-4 w-4 text-text-tertiary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-text-secondary">
          {localize(course.titleKey)}
        </p>
      </div>
    </div>
  );
}

export default function LearningPanel() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { setActive } = useActivePanel();
  const [completedCourseId, setCompletedCourseId] = useState<string | null>(null);
  const { startTour } = useLandingPageTour(() => setCompletedCourseId('landing-page-buttons'));

  const handleStartTour = useCallback(() => {
    // The tour highlights elements that only exist on the main chat route
    // (textarea, send button, header buttons) and inside the "conversations"
    // sidebar panel (search, projects) — switch to both before driving.
    navigate('/c/new');
    setActive('conversations');
    window.setTimeout(() => startTour(), 200);
  }, [navigate, setActive, startTour]);

  return (
    <div data-testid="learning-panel" className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border-light bg-surface-secondary px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-submit/10">
            <GraduationCap className="h-3.5 w-3.5 text-surface-submit" />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-text-primary">
            {localize('com_learning_panel_title')}
          </p>
          <DiffPopoverButton />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {activeCourses.map((course) => (
            <CourseRow key={course.id} course={course} onSelect={handleStartTour} />
          ))}
        </div>

        {completedCourseId != null && <RatingStars courseId={completedCourseId} />}

        {comingSoonCourses.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
              {localize('com_learning_coming_soon')}
            </p>
            {comingSoonCourses.map((course) => (
              <ComingSoonRow key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
