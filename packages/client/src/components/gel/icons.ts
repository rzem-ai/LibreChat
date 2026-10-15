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

/** Semantic icons, so the underlying icon set can be swapped in this one file. */
const icons = {
  Tour: Signpost as LucideIcon,
  Article: FileText as LucideIcon,
  External: ExternalLink as LucideIcon,
  Complete: CircleCheck as LucideIcon,
  Incomplete: Circle as LucideIcon,
  Search: Search as LucideIcon,
  Clear: X as LucideIcon,
  Help: CircleHelp as LucideIcon,
  Back: ArrowLeft as LucideIcon,
  Agent: Bot as LucideIcon,
  Academy: GraduationCap as LucideIcon,
  Guide: BookOpen as LucideIcon,
  Feedback: MessageSquareHeart as LucideIcon,
  Star: Star as LucideIcon,
  Clock: Clock as LucideIcon,
  Tip: Lightbulb as LucideIcon,
  Close: X as LucideIcon,
};

export type IconName = keyof typeof icons;

export const Icon: Record<IconName, LucideIcon> = icons;
