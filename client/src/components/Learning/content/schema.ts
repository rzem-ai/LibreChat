import { z } from 'zod';

export const TourStepSchema = z.object({
  id: z.string().optional(),
  element: z.string(),
  title: z.string(),
  description: z.string(),
  side: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  expandSidebarBefore: z.boolean().optional(),
});

export const CourseContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  estimatedMinutes: z.number().optional(),
  isGettingStartedTour: z.boolean().optional(),
  comingSoon: z.boolean().default(false),
  steps: z.array(TourStepSchema),
});

export type TourStep = z.infer<typeof TourStepSchema>;
export type CourseContent = z.infer<typeof CourseContentSchema>;

export type TourStatus = 'complete' | 'in-progress' | 'not-started';

export type TourProgress = { step: number; total: number; completed: boolean };

export const ResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['tour', 'article', 'external']),
  tags: z.array(z.string()),
  durationLabel: z.string().optional(),
  updated: z.string().optional(),
  externalHref: z.string().url().optional(),
});

export const FaqSchema = z.object({ question: z.string(), answer: z.string() });

export const ArticleFrontmatterSchema = z.object({
  title: z.string(),
  updated: z.string(),
  durationLabel: z.string().optional(),
});

export const ReleaseFrontmatterSchema = z.object({
  title: z.string(),
  version: z.string(),
  date: z.string(),
});

export type Resource = z.infer<typeof ResourceSchema>;
export type Faq = z.infer<typeof FaqSchema>;
export type ArticleFrontmatter = z.infer<typeof ArticleFrontmatterSchema>;
export type ReleaseFrontmatter = z.infer<typeof ReleaseFrontmatterSchema>;
