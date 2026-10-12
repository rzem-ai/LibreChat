import { Check, Lock, X } from 'lucide-react';
import {
  Tag,
  MCPIcon,
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
} from '@librechat/client';
import type { ReactNode } from 'react';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import { hasConfiguredIcon, hasLimitedAccess } from './mcpServerUtils';
import MCPServerIcon from './MCPServerIcon';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

// TODO(mcp-gateway): the fields below are placeholders until the MCP Gateway
// exposes a connector-metadata endpoint. Replace with real per-server data once
// that endpoint exists; keep the shape (description + three labeled lists).
const PLACEHOLDER_DESCRIPTION =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin justo ut magna tincidunt molestie. Lorem ipsum dolor sit amet, consectetur adipiscing elit...';
const PLACEHOLDER_USE_CASES = [
  'Find files by keyword',
  'Summarise a document',
  'Look up list items',
];
const PLACEHOLDER_ACCESS = ['All Deloitte Sharepoint', 'All Deloitte Onedrive'];
const PLACEHOLDER_LIMITATIONS = [
  'Private Sharepoint folders',
  'Private Sharepoint files',
  'Private Onedrive folders',
  'Private Onedrive files',
];

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

interface MCPServerTooltipProps {
  /** Element that opens the tooltip on hover/focus. */
  trigger: ReactNode;
  server: MCPServerDefinition;
}

/** Rich hover card describing an MCP connector: identity, access tier, use cases, and limitations. */
export default function MCPServerTooltip({ trigger, server }: MCPServerTooltipProps) {
  const localize = useLocalize();
  const displayName = server.config?.title || server.serverName;
  const limitedAccess = hasLimitedAccess(server);

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent
          side={ESide.Right}
          align="start"
          className="w-[417px] rounded-xl border-border bg-card p-0 text-card-foreground shadow-md"
        >
          <div className="flex flex-col gap-4 border-b border-border p-6">
            <div className="flex h-8 items-center gap-2">
              {hasConfiguredIcon(server.config ?? {}) ? (
                <MCPServerIcon
                  iconPath={server.config?.iconPath}
                  iconPathLight={server.config?.iconPathLight}
                  iconPathDark={server.config?.iconPathDark}
                  alt=""
                  className="size-8 rounded-md object-contain"
                />
              ) : (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-tertiary">
                  <MCPIcon className="size-5 text-text-secondary" aria-hidden="true" />
                </div>
              )}
              <div className="flex flex-col justify-center gap-1">
                <p className="text-xs text-muted-foreground">{localize('com_ui_connector')}</p>
                <p className="text-base font-semibold text-card-foreground">{displayName}</p>
              </div>
            </div>
            {limitedAccess && (
              <Tag
                variant="warning"
                label={localize('com_ui_limited_access')}
                LabelNode={<Lock className="size-3.5" aria-hidden="true" />}
                className="w-fit"
                labelClassName="!ml-0 flex items-center gap-1.5 px-1.5 py-0.5 text-xs font-normal uppercase tracking-wide"
              />
            )}
            <p className="text-sm leading-5 text-muted-foreground">
              {/* TODO(mcp-gateway): fetch real description from the MCP Gateway. */}
              {PLACEHOLDER_DESCRIPTION}{' '}
              <button type="button" className="font-semibold text-primary hover:text-primary-hover">
                {localize('com_ui_learn_more')}
              </button>
            </p>
          </div>
          <div className="flex flex-col gap-6 p-6 pt-4">
            <TooltipRow label={localize('com_nav_mcp_tooltip_use_cases')}>
              {/* TODO(mcp-gateway): fetch real use cases from the MCP Gateway. */}
              {PLACEHOLDER_USE_CASES.map((useCase) => (
                <TooltipListItem
                  key={useCase}
                  icon={
                    <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  }
                >
                  {useCase}
                </TooltipListItem>
              ))}
            </TooltipRow>
            <TooltipRow label={localize('com_nav_mcp_tooltip_access')}>
              {/* TODO(mcp-gateway): fetch real access scope from the MCP Gateway. */}
              {PLACEHOLDER_ACCESS.map((access) => (
                <TooltipListItem
                  key={access}
                  icon={
                    <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  }
                >
                  {access}
                </TooltipListItem>
              ))}
            </TooltipRow>
            <TooltipRow label={localize('com_nav_mcp_tooltip_limitation')}>
              {/* TODO(mcp-gateway): fetch real limitations from the MCP Gateway. */}
              {PLACEHOLDER_LIMITATIONS.map((limitation) => (
                <TooltipListItem
                  key={limitation}
                  icon={<X className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                >
                  {limitation}
                </TooltipListItem>
              ))}
            </TooltipRow>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
