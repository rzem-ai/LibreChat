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
  | 'tour'
  | 'article'
  | 'external'
  | 'complete'
  | 'incomplete'
  | 'search'
  | 'clear'
  | 'help'
  | 'back'
  | 'agent'
  | 'academy'
  | 'guide'
  | 'feedback'
  | 'star'
  | 'clock'
  | 'tip'
  | 'close';

export const Icon: Record<IconName, LucideIcon> = {
  tour: Signpost,
  article: FileText,
  external: ExternalLink,
  complete: CircleCheck,
  incomplete: Circle,
  search: Search,
  clear: X,
  help: CircleHelp,
  back: ArrowLeft,
  agent: Bot,
  academy: GraduationCap,
  guide: BookOpen,
  feedback: MessageSquareHeart,
  star: Star,
  clock: Clock,
  tip: Lightbulb,
  close: X,
};
