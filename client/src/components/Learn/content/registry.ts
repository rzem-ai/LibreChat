import type { CourseContent, TourStep } from './schema';
import gettingStarted from './tours/getting-started.json';
import connectors from './tours/_mock-connectors.json';
import { CourseContentSchema } from './schema';
import agents from './tours/_mock-agents.json';

export const TOURS: CourseContent[] = [gettingStarted, connectors, agents].map((raw) =>
  CourseContentSchema.parse(raw),
);
const stepsByCourseId = new Map(TOURS.map((tour) => [tour.id, tour.steps]));

/** Sourced from the tour flagged `isGettingStartedTour` in content/tours. */
const gettingStartedTour = TOURS.find((tour) => tour.isGettingStartedTour);
if (!gettingStartedTour) {
  throw new Error('No tour is flagged isGettingStartedTour');
}
export const GETTING_STARTED_COURSE_ID = gettingStartedTour.id;

export function getCourseSteps(courseId: string): TourStep[] {
  const steps = stepsByCourseId.get(courseId);
  if (!steps) {
    throw new Error(`No tour steps registered for course "${courseId}"`);
  }
  return steps;
}
