import {
  Bot,
  Circle,
  Clock,
  Search,
  Signpost,
  FileText,
  ArrowLeft,
  BookOpen,
  CircleHelp,
  CircleCheck,
  ExternalLink,
  GraduationCap,
  Lightbulb,
  MessageSquareHeart,
  Star,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Semantic icon names, so the underlying icon set can be swapped in one place. */
export type IconName =
  | 'Tour'
  | 'Article'
  | 'External'
  | 'Complete'
  | 'Incomplete'
  | 'Search'
  | 'Clear'
  | 'Help'
  | 'Back'
  | 'Agent'
  | 'Academy'
  | 'Guide'
  | 'Feedback'
  | 'Star'
  | 'Clock'
  | 'Tip'
  | 'Close';

export const Icon: Record<IconName, LucideIcon> = {
  Tour: Signpost,
  Article: FileText,
  External: ExternalLink,
  Complete: CircleCheck,
  Incomplete: Circle,
  Search: Search,
  Clear: X,
  Help: CircleHelp,
  Back: ArrowLeft,
  Agent: Bot,
  Academy: GraduationCap,
  Guide: BookOpen,
  Feedback: MessageSquareHeart,
  Star: Star,
  Clock: Clock,
  Tip: Lightbulb,
  Close: X,
};
