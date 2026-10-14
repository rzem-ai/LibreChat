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
