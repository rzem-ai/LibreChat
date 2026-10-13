import gettingStartedGuide from './getting-started-guide.json';
import { CourseContentSchema } from './schema';
import type { TourStep } from './schema';

const courses = [gettingStartedGuide].map((raw) => CourseContentSchema.parse(raw));
const stepsByCourseId = new Map(courses.map((course) => [course.id, course.steps]));

/** Sourced from getting-started-guide.json's own `id` field — the only place that value is authored. */
export const GETTING_STARTED_COURSE_ID = courses[0].id;

export function getCourseSteps(courseId: string): TourStep[] {
  const steps = stepsByCourseId.get(courseId);
  if (!steps) {
    throw new Error(`No tour steps registered for course "${courseId}"`);
  }
  return steps;
}
