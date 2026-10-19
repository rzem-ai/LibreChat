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
export const registry = {
  tour: Signpost as LucideIcon,
  article: FileText as LucideIcon,
  external: ExternalLink as LucideIcon,
  complete: CircleCheck as LucideIcon,
  incomplete: Circle as LucideIcon,
  search: Search as LucideIcon,
  clear: X as LucideIcon,
  help: CircleHelp as LucideIcon,
  back: ArrowLeft as LucideIcon,
  agent: Bot as LucideIcon,
  academy: GraduationCap as LucideIcon,
  guide: BookOpen as LucideIcon,
  feedback: MessageSquareHeart as LucideIcon,
  star: Star as LucideIcon,
  clock: Clock as LucideIcon,
  tip: Lightbulb as LucideIcon,
  close: X as LucideIcon,
};

export type IconName = keyof typeof registry;
