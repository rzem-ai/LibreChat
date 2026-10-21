import type { CourseContent, TourStep } from './schema';
import savedPrompts from './tours/saved-prompts-and-prompt-library.json';
import sharing from './tours/sharing-skills-and-agents.json';
import gettingStarted from './tours/getting-started.json';
import connectors from './tours/using-connectors.json';
import buildSkill from './tours/build-a-skill.json';
import { CourseContentSchema } from './schema';

export const TOURS: CourseContent[] = [
  gettingStarted,
  connectors,
  savedPrompts,
  buildSkill,
  sharing,
].map((raw) => CourseContentSchema.parse(raw));
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
