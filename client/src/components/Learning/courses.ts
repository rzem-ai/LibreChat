import type { TranslationKeys } from '~/hooks';

export interface LearningCourse {
  id: string;
  titleKey: TranslationKeys;
  descriptionKey: TranslationKeys;
  estimatedMinutes?: number;
  comingSoon: boolean;
}

/** Static MVP course catalog — no backend content system, just a plain list. */
export const COURSES: LearningCourse[] = [
  {
    id: 'landing-page-buttons',
    titleKey: 'com_learning_course_landing_page_title',
    descriptionKey: 'com_learning_course_landing_page_description',
    estimatedMinutes: 3,
    comingSoon: false,
  },
  {
    id: 'mcp-server-guide',
    titleKey: 'com_ui_mcp_servers',
    descriptionKey: 'com_learning_coming_soon',
    comingSoon: true,
  },
  {
    id: 'agents-guide',
    titleKey: 'com_ui_agents',
    descriptionKey: 'com_learning_coming_soon',
    comingSoon: true,
  },
];
