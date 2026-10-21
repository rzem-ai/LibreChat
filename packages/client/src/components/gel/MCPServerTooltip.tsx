import { useMemo } from 'react';
import { Check, Lock, X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import type { HoverCardRender } from './HoverGroup';
import { HoverCardGroup, HoverCardTarget } from './HoverGroup';
import { Tag } from '../Tag';

// Deloitte Custom Change: connector tooltip primitives. Like ModelInfoTooltip, this module
// has no app hooks or data fetching — callers resolve icons, localization and gateway
// toolset data and pass them in as props.

function TooltipListItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      {icon}
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function TooltipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-start gap-8">
      <p className="w-[76px] shrink-0 text-sm text-muted-foreground">{label}</p>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

export interface MCPServerTooltipDetails {
  useCases: string[];
  access: string[];
  limitations: string[];
}

export interface MCPServerTooltipLabels {
  /** Eyebrow above the connector name, e.g. "Connector". */
  connector: string;
  limitedAccess: string;
  useCases: string;
  access: string;
  limitation: string;
}

export interface MCPServerTooltipContent {
  /** Pre-rendered connector icon — callers own icon resolution (themed variants, fallbacks). */
  icon: ReactNode;
  name: string;
  limitedAccess?: boolean;
  description?: string;
  /** Use cases, access and limitations; only present when the gateway returned toolset details. */
  details?: MCPServerTooltipDetails;
  labels: MCPServerTooltipLabels;
}

const CHECK_ICON = <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
const X_ICON = <X className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;

/** Card body describing an MCP connector: identity, access tier, use cases, and limitations. */
export function MCPServerTooltipCard({
  id,
  icon,
  name,
  limitedAccess,
  description,
  details,
  labels,
}: MCPServerTooltipContent & { id?: string }): ReactElement {
  return (
    <div id={id} role="region" aria-label={name}>
      <div className="flex flex-col gap-4 border-b border-border p-6">
        <div className="flex items-start gap-2">
          {icon}
          <div className="flex h-8 min-w-0 flex-col justify-between">
            <p className="text-xs leading-none text-muted-foreground">{labels.connector}</p>
            <p className="text-base font-semibold leading-none text-card-foreground">{name}</p>
          </div>
        </div>
        {limitedAccess && (
          <Tag
            label={labels.limitedAccess}
            LabelNode={<Lock className="size-3.5" aria-hidden="true" />}
            className="w-fit self-start border border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            labelClassName="!ml-0 flex items-center gap-1.5 px-1.5 py-0.5 text-[12px] font-medium tracking-wide whitespace-nowrap"
          />
        )}
        {description && (
          <p className="text-sm leading-5 text-muted-foreground">
            {description}{' '}
            {/* Commented out per product decision: no destination page exists yet for
              this control, but keep the markup in place for when one does.
          <button type="button" className="font-semibold text-primary hover:text-primary-hover">
            {localize('com_ui_learn_more')}
          </button>
          */}
          </p>
        )}
      </div>
      {details && (
        <div className="flex flex-col gap-6 p-6 pt-4">
          <TooltipRow label={labels.useCases}>
            {details.useCases.map((useCase) => (
              <TooltipListItem key={useCase} icon={CHECK_ICON}>
                {useCase}
              </TooltipListItem>
            ))}
          </TooltipRow>
          <TooltipRow label={labels.access}>
            {details.access.map((access) => (
              <TooltipListItem key={access} icon={CHECK_ICON}>
                {access}
              </TooltipListItem>
            ))}
          </TooltipRow>
          <TooltipRow label={labels.limitation}>
            {details.limitations.map((limitation) => (
              <TooltipListItem key={limitation} icon={X_ICON}>
                {limitation}
              </TooltipListItem>
            ))}
          </TooltipRow>
        </div>
      )}
    </div>
  );
}

const MCP_CARD_CLASS =
  'w-[417px] rounded-xl border-border bg-card p-0 text-card-foreground shadow-md';

/** Wrap a connector list in this so its rows share one card, docked beside the list. */
export function MCPServerHoverGroup({ children }: { children: ReactNode }): ReactElement {
  return <HoverCardGroup contentClassName={MCP_CARD_CLASS}>{children}</HoverCardGroup>;
}

/**
 * Row-level target for use inside an `MCPServerHoverGroup`: the card is shared by the whole
 * list, opens instantly, and stays docked in one position — the same behavior as the model picker.
 */
export function MCPServerHoverTarget({
  content,
  children,
}: {
  content: MCPServerTooltipContent;
  children: ReactElement;
}): ReactElement {
  const render = useMemo<HoverCardRender>(
    () => (cardId) => <MCPServerTooltipCard {...content} id={cardId} />,
    [content],
  );
  return <HoverCardTarget render={render}>{children}</HoverCardTarget>;
}
