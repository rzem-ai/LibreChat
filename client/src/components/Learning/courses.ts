import type { CourseContent } from './content/schema';
import { TOURS } from './content/registry';

export type LearningCourse = Omit<CourseContent, 'steps'>;

export const COURSES: LearningCourse[] = TOURS.map(({ id, title, description, ...rest }) => ({
  id,
  title,
  description,
  estimatedMinutes: rest.estimatedMinutes,
  isGettingStartedTour: rest.isGettingStartedTour,
  comingSoon: rest.comingSoon,
}));
