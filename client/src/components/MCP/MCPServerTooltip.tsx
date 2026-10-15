// Deloitte Custom Change: connector tooltip backed by real MCP Gateway toolset data
// (use cases, access, limitations), with a minimal fallback when a server's toolset
// isn't present in the gateway response.
import { Check, Lock, X } from 'lucide-react';
import { Tag, MCPIcon, HoverCardGroup, HoverCardTarget } from '@librechat/client';
import type { ReactElement, ReactNode } from 'react';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import { hasConfiguredIcon, hasLimitedAccess, getConfiguredToolsetName } from './mcpServerUtils';
import { useMCPToolsetsQuery } from '~/data-provider';
import MCPServerIcon from './MCPServerIcon';
import { useLocalize } from '~/hooks';

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
  trigger: ReactElement;
  server: MCPServerDefinition;
}

/** Card body describing an MCP connector: identity, access tier, use cases, and limitations. */
function MCPServerTooltipCard({ server }: { server: MCPServerDefinition }) {
  const localize = useLocalize();
  const displayName = server.config?.title || server.serverName;
  const limitedAccess = hasLimitedAccess(server);
  // Deloitte Custom Change: resolve this connector's real toolset metadata from the
  // MCP Gateway, falling back to the server's own config description when absent.
  const { data } = useMCPToolsetsQuery();
  const toolsetName = getConfiguredToolsetName(server);
  const details = data?.toolsets.find((toolset) => toolset.name === toolsetName);
  const description = details?.userFriendlyDescription ?? server.config?.description;

  return (
    <div>
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
            label={localize('com_ui_limited_access')}
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
      {/* Deloitte Custom Change: use-cases/access/limitations are only shown when
        the gateway returned details for this connector's toolset. */}
      {details && (
        <div className="flex flex-col gap-6 p-6 pt-4">
          <TooltipRow label={localize('com_nav_mcp_tooltip_use_cases')}>
            {details.useCases.map((useCase) => (
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
            {details.access.map((access) => (
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
            {details.limitations.map((limitation) => (
              <TooltipListItem
                key={limitation}
                icon={<X className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              >
                {limitation}
              </TooltipListItem>
            ))}
          </TooltipRow>
        </div>
      )}
    </div>
  );
}

/**
 * Row-level target for use inside a `HoverCardGroup`: the card is shared by the whole list,
 * opens instantly, and stays docked in one position — the same behavior as the model picker.
 */
export function MCPServerTooltipTarget({ trigger, server }: MCPServerTooltipProps) {
  return (
    <HoverCardTarget render={() => <MCPServerTooltipCard server={server} />}>
      {trigger}
    </HoverCardTarget>
  );
}

const MCP_CARD_CLASS =
  'w-[417px] rounded-xl border-border bg-card p-0 text-card-foreground shadow-md';

/** Wrap a connector list in this so its rows share one card, docked beside the list. */
export function MCPServerHoverGroup({ children }: { children: ReactNode }) {
  return <HoverCardGroup contentClassName={MCP_CARD_CLASS}>{children}</HoverCardGroup>;
}

/** Standalone variant for a lone trigger (e.g. a card outside a list): wraps its own group. */
export default function MCPServerTooltip(props: MCPServerTooltipProps) {
  return (
    <MCPServerHoverGroup>
      <MCPServerTooltipTarget {...props} />
    </MCPServerHoverGroup>
  );
}
