// Deloitte Custom Change: connector tooltip backed by real MCP Gateway toolset data
// (use cases, access, limitations), with a minimal fallback when a server's toolset
// isn't present in the gateway response. Rendering lives in @librechat/client's gel
// MCPServerTooltip; this wrapper resolves data, icons and localization.
import { useMemo } from 'react';
import {
  MCPIcon,
  MCPServerHoverGroup as GelMCPServerHoverGroup,
  MCPServerHoverTarget,
} from '@librechat/client';
import type { MCPServerTooltipContent } from '@librechat/client';
import type { ReactElement, ReactNode } from 'react';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import { hasConfiguredIcon, hasLimitedAccess, getConfiguredToolsetName } from './mcpServerUtils';
import { useMCPToolsetsQuery } from '~/data-provider';
import MCPServerIcon from './MCPServerIcon';
import { useLocalize } from '~/hooks';

interface MCPServerTooltipProps {
  /** Element that opens the tooltip on hover/focus. */
  trigger: ReactElement;
  server: MCPServerDefinition;
}

function ConnectorIcon({ server }: { server: MCPServerDefinition }): ReactElement {
  if (!hasConfiguredIcon(server.config ?? {})) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-tertiary">
        <MCPIcon className="size-5 text-text-secondary" aria-hidden="true" />
      </div>
    );
  }
  return (
    <MCPServerIcon
      iconPath={server.config?.iconPath}
      iconPathLight={server.config?.iconPathLight}
      iconPathDark={server.config?.iconPathDark}
      alt=""
      className="size-8 rounded-md object-contain"
    />
  );
}

/**
 * Row-level target for use inside an `MCPServerHoverGroup`: the card is shared by the whole list,
 * opens instantly, and stays docked in one position — the same behavior as the model picker.
 */
export function MCPServerTooltipTarget({ trigger, server }: MCPServerTooltipProps) {
  const localize = useLocalize();
  // Deloitte Custom Change: resolve this connector's real toolset metadata from the
  // MCP Gateway, falling back to the server's own config description when absent.
  const { data } = useMCPToolsetsQuery();
  const toolsetName = getConfiguredToolsetName(server);
  const details = data?.toolsets.find((toolset) => toolset.name === toolsetName);

  const content = useMemo<MCPServerTooltipContent>(
    () => ({
      icon: <ConnectorIcon server={server} />,
      name: server.config?.title || server.serverName,
      limitedAccess: hasLimitedAccess(server),
      description: details?.userFriendlyDescription ?? server.config?.description,
      details: details && {
        useCases: details.useCases,
        access: details.access,
        limitations: details.limitations,
      },
      labels: {
        connector: localize('com_ui_connector'),
        limitedAccess: localize('com_ui_limited_access'),
        useCases: localize('com_nav_mcp_tooltip_use_cases'),
        access: localize('com_nav_mcp_tooltip_access'),
        limitation: localize('com_nav_mcp_tooltip_limitation'),
      },
    }),
    [server, details, localize],
  );

  return <MCPServerHoverTarget content={content}>{trigger}</MCPServerHoverTarget>;
}

/** Wrap a connector list in this so its rows share one card, docked beside the list. */
export function MCPServerHoverGroup({ children }: { children: ReactNode }) {
  // The card mounts lazily on first hover; warm the toolsets cache now so that first card is complete.
  useMCPToolsetsQuery();
  return <GelMCPServerHoverGroup>{children}</GelMCPServerHoverGroup>;
}

/** Standalone variant for a lone trigger (e.g. a card outside a list): wraps its own group. */
export default function MCPServerTooltip(props: MCPServerTooltipProps) {
  return (
    <MCPServerHoverGroup>
      <MCPServerTooltipTarget {...props} />
    </MCPServerHoverGroup>
  );
}
