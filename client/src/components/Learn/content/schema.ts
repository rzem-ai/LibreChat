import { z } from 'zod';

export const TourStepSchema = z.object({
  id: z.string().optional(),
  element: z.string(),
  title: z.string(),
  description: z.string(),
  side: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  expandSidebarBefore: z.boolean().optional(),
  /** Selectors clicked in order when Next is pressed, to open the dialog or menu the next step targets. */
  clickOnNext: z.array(z.string()).optional(),
});

export const CourseContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  estimatedMinutes: z.number().optional(),
  isGettingStartedTour: z.boolean().optional(),
  comingSoon: z.boolean().default(false),
  /** Sidebar panel that must be active before it starts. Defaults to `conversations`. */
  startPanel: z.string().optional(),
  steps: z.array(TourStepSchema),
});

export type TourStep = z.infer<typeof TourStepSchema>;
export type CourseContent = z.infer<typeof CourseContentSchema>;

export type TourStatus = 'complete' | 'in-progress' | 'not-started';

// Deloitte Custom Change: tour progress stored in MongoDB: TourProgress removed; use TTourProgress from librechat-data-provider

export const BLURB_MAX_LENGTH = 70;

const THIRD_PERSON_PATTERN = /\b(users?|people|learners?)\b/i;

export const BlurbSchema = z
  .string()
  .max(BLURB_MAX_LENGTH, `Use at most ${BLURB_MAX_LENGTH} characters`)
  .refine((blurb) => !blurb.endsWith('.'), 'Do not end with a full stop')
  .refine(
    (blurb) => !THIRD_PERSON_PATTERN.test(blurb),
    'Describe what the resource covers or lets you do, not what users or people do',
  );

export const ResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: BlurbSchema,
  type: z.enum(['tour', 'article', 'external']),
  tags: z.array(z.string()),
  durationLabel: z.string().optional(),
  updated: z.string().optional(),
  externalHref: z.string().url().optional(),
});

export const FaqSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const ARTICLE_TYPES = ['concept', 'how-to', 'guide', 'reference'] as const;

export const ArticleFrontmatterSchema = z.object({
  title: z.string(),
  updated: z.string(),
  durationLabel: z.string().optional(),
  type: z.enum(ARTICLE_TYPES).optional(),
  /** One-paragraph TL;DR rendered as the lede under the title. */
  summary: z.string().optional(),
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
