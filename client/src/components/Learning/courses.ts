import { GETTING_STARTED_COURSE_ID } from './Courses/content/registry';

export interface LearningCourse {
  id: string;
  title: string;
  description: string;
  estimatedMinutes?: number;
  comingSoon: boolean;
}

/** Static MVP course catalog — no backend content system, just a plain list. */
export const COURSES: LearningCourse[] = [
  {
    id: GETTING_STARTED_COURSE_ID,
    title: 'Getting Started Tour',
    description:
      'Learn how to get started with MyAssist in this quick introductory tour, highly recommended for new users',
    estimatedMinutes: 4,
    comingSoon: false,
  },
  {
    id: 'mcp-server-guide',
    title: 'Connectors',
    description: 'Coming soon',
    comingSoon: true,
  },
  {
    id: 'agents-guide',
    title: 'Agents',
    description: 'Coming soon',
    comingSoon: true,
  },
];
