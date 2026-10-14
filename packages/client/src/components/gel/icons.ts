import {
  Bot,
  Circle,
  Search,
  Signpost,
  FileText,
  ArrowLeft,
  CircleHelp,
  CircleCheck,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Semantic icon names, so the underlying icon set can be swapped in one place. */
export type GelIconName =
  | 'tour'
  | 'article'
  | 'external'
  | 'complete'
  | 'incomplete'
  | 'search'
  | 'help'
  | 'back'
  | 'agent';

export const gelIcons: Record<GelIconName, LucideIcon> = {
  tour: Signpost,
  article: FileText,
  external: ExternalLink,
  complete: CircleCheck,
  incomplete: Circle,
  search: Search,
  help: CircleHelp,
  back: ArrowLeft,
  agent: Bot,
};
