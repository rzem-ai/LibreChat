import React from 'react';
import {
  Dices,
  BoxIcon,
  FileText,
  PenLineIcon,
  LightbulbIcon,
  LineChartIcon,
  ShoppingBagIcon,
  PlaneTakeoffIcon,
  GraduationCapIcon,
  TerminalSquareIcon,
  Users as UsersIcon,
  Beaker as BeakerIcon,
  Settings as SettingsIcon,
  Target as TargetIcon,
  TrendingUp as TrendingUpIcon,
  Briefcase as BriefcaseIcon,
  Layers as LayersIcon,
  Boxes as BoxesIcon,
  Shield as ShieldIcon,
  MessageSquare as MessageSquareIcon,
  Microscope as MicroscopeIcon,
  BookOpen as BookOpenIcon,
  Workflow as WorkflowIcon,
  AlertTriangle as AlertTriangleIcon,
} from 'lucide-react';
import { cn } from '~/utils';

const categoryIconMap: Record<string, React.ElementType> = {
  misc: BoxIcon,
  roleplay: Dices,
  write: PenLineIcon,
  idea: LightbulbIcon,
  shop: ShoppingBagIcon,
  finance: LineChartIcon,
  code: TerminalSquareIcon,
  travel: PlaneTakeoffIcon,
  teach_or_explain: GraduationCapIcon,
  general: BoxIcon,
  hr: UsersIcon,
  rd: BeakerIcon,
  it: TerminalSquareIcon,
  sales: LineChartIcon,
  aftersales: SettingsIcon,
  strategy_scenarios: TargetIcon,
  business_case_roi: TrendingUpIcon,
  proposals_bids: BriefcaseIcon,
  change_operating_model: LayersIcon,
  ba_delivery: BoxesIcon,
  compliance_governance: ShieldIcon,
  communications_stakeholders: MessageSquareIcon,
  research_analytics: MicroscopeIcon,
  learning_training: BookOpenIcon,
  talent_staffing: UsersIcon,
  operations_technology: WorkflowIcon,
  legal_risk: AlertTriangleIcon,
};

// TODO: standardise these colours from a shared Deloitte colour config (and ensure every
// entry has a dark: variant) in a follow-up PR, so the dark mode work lands as its own,
// independently reviewable change. Link a tracking issue here once filed.
const categoryColorMap: Record<string, string> = {
  code: 'text-series-5',
  misc: 'text-series-1',
  shop: 'text-series-6',
  idea: 'text-series-4',
  write: 'text-series-6',
  travel: 'text-series-4',
  finance: 'text-series-2',
  roleplay: 'text-series-2',
  teach_or_explain: 'text-series-1',
  general: 'text-series-1',
  hr: 'text-series-7',
  rd: 'text-series-6',
  it: 'text-series-5',
  sales: 'text-series-2',
  aftersales: 'text-series-4',
  // Deloitte Custom Change: additional skill categories not present upstream (PR #203)
  strategy_scenarios: 'text-blue-600 dark:text-blue-400',
  business_case_roi: 'text-green-600 dark:text-green-400',
  proposals_bids: 'text-indigo-600 dark:text-indigo-400',
  change_operating_model: 'text-yellow-600 dark:text-yellow-400',
  ba_delivery: 'text-emerald-600 dark:text-emerald-400',
  compliance_governance: 'text-slate-600 dark:text-slate-400',
  communications_stakeholders: 'text-cyan-600 dark:text-cyan-400',
  research_analytics: 'text-violet-600 dark:text-violet-400',
  learning_training: 'text-amber-600 dark:text-amber-400',
  talent_staffing: 'text-pink-600 dark:text-pink-400',
  operations_technology: 'text-teal-600 dark:text-teal-400',
  legal_risk: 'text-rose-600 dark:text-rose-400',
};

export default function CategoryIcon({
  category,
  className = '',
}: {
  category: string;
  className?: string;
}) {
  const IconComponent = categoryIconMap[category] ?? FileText;
  const colorClass = categoryColorMap[category] ?? 'text-text-secondary';
  return <IconComponent className={cn('size-4', colorClass, className)} aria-hidden="true" />;
}
