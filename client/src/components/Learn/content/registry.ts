import type { CourseContent, TourStep } from './schema';
import gettingStarted from './tours/getting-started.json';
import { CourseContentSchema } from './schema';

/** The using-connectors tour is hidden; re-add its import here to restore. */
export const TOURS: CourseContent[] = [gettingStarted].map((raw) => CourseContentSchema.parse(raw));
const stepsByCourseId = new Map(TOURS.map((tour) => [tour.id, tour.steps]));

/** Sourced from the tour flagged `isGettingStartedTour` in content/tours. */
const gettingStartedTour = TOURS.find((tour) => tour.isGettingStartedTour);
if (!gettingStartedTour) {
  throw new Error('No tour is flagged isGettingStartedTour');
}
export const GETTING_STARTED_COURSE_ID = gettingStartedTour.id;

export function getCourse(courseId: string): CourseContent | undefined {
  return TOURS.find((tour) => tour.id === courseId);
}

export function getCourseSteps(courseId: string): TourStep[] {
  const steps = stepsByCourseId.get(courseId);
  if (!steps) {
    throw new Error(`No tour steps registered for course "${courseId}"`);
  }
  return steps;
}
