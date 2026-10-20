import { Constants } from 'librechat-data-provider';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { Agent, TEphemeralAgent } from 'librechat-data-provider';
import type { LCTool } from '@librechat/agents';
import type { Logger } from 'winston';
import type { ParsedServerConfig } from '~/mcp/types';
import type { MCPManager } from '~/mcp/MCPManager';

/**
 * Nudges the model to actually call file_search before answering, so retrieval
 * happens and grounds the response in the attached documents. Source-card
 * citations depend on this: the file_search attachment (and any end-of-trace
 * anchors) can only reference sources the tool retrieved on the current turn,
 * so if the model skips the tool there is nothing to cite. Critically, this
 * demands a fresh search on EVERY substantive turn — not just the first —
 * because the model otherwise answers follow-ups from passages already in
 * context and no new file_search artifact is produced, leaving those turns
 * uncited. This purposefully omits any anchor-emission instructions — citations
 * are attached deterministically after the run rather than relying on the model
 * to echo markers, which was unreliable and could degrade answer quality.
 */
const FILE_SEARCH_AGENT_INSTRUCTIONS =
  'If the file_search tool is available and documents are attached for this conversation, call file_search before answering any substantive question — on every turn, not just the first, and even for questions which appear answerable from general knowledge or from passages already retrieved earlier in this conversation. Do not reuse or rely on results from a previous turn: re-run file_search for each new question so the current answer is freshly grounded in and citable from the retrieved sources. The attached documents may contain organisation-specific definitions, policies, or details that supersede or supplement what you already know. Prefer searching over assuming. Only skip file_search for purely conversational messages such as greetings or small talk. If file_search is unavailable or no documents are attached, answer normally without attempting tool calls.';

/**
 * Agent type with optional tools array that can contain DynamicStructuredTool or string.
 * For context operations, we only require id and instructions, other Agent fields are optional.
 */
export type AgentWithTools = Pick<Agent, 'id'> &
  Partial<Omit<Agent, 'id' | 'tools'>> & {
    tools?: Array<DynamicStructuredTool | string>;
    /** Serializable tool definitions for event-driven mode */
    toolDefinitions?: LCTool[];
  };

/**
 * Extracts unique MCP server names from an agent's tools or tool definitions.
 * Supports both full tool instances (tools) and serializable definitions (toolDefinitions).
 * @param agent - The agent with tools and/or tool definitions
 * @returns Array of unique MCP server names
 */
export function extractMCPServers(agent: AgentWithTools): string[] {
  const mcpServers = new Set<string>();

  /** Check tool instances (non-event-driven mode) */
  if (agent?.tools?.length) {
    for (const tool of agent.tools) {
      if (tool instanceof DynamicStructuredTool && tool.name.includes(Constants.mcp_delimiter)) {
        const carried = (tool as { mcpRawServerName?: string }).mcpRawServerName;
        const serverName = carried ?? tool.name.split(Constants.mcp_delimiter).pop();
        if (serverName) {
          mcpServers.add(serverName);
        }
      }
    }
  }

  /** Check tool definitions (event-driven mode) */
  if (agent?.toolDefinitions?.length) {
    for (const toolDef of agent.toolDefinitions) {
      if (toolDef.name?.includes(Constants.mcp_delimiter)) {
        const serverName = toolDef.serverName ?? toolDef.name.split(Constants.mcp_delimiter).pop();
        if (serverName) {
          mcpServers.add(serverName);
        }
      }
    }
  }

  return Array.from(mcpServers);
}

/**
 * Fetches MCP instructions for the given server names.
 * @param {string[]} mcpServers - Array of MCP server names
 * @param {MCPManager} mcpManager - MCP manager instance
 * @param {Logger} [logger] - Optional logger instance
 * @returns {Promise<string>} MCP instructions string, empty if none
 */
export async function getMCPInstructionsForServers(
  mcpServers: string[],
  mcpManager: MCPManager,
  logger?: Logger,
  configServers?: Record<string, ParsedServerConfig>,
): Promise<string> {
  if (!mcpServers.length) {
    return '';
  }
  try {
    const mcpInstructions = await mcpManager.formatInstructionsForContext(
      mcpServers,
      configServers,
    );
    if (mcpInstructions && logger) {
      logger.debug('[AgentContext] Fetched MCP instructions', {
        serverCount: mcpServers.length,
      });
    }
    return mcpInstructions || '';
  } catch {
    if (logger) {
      logger.error('[AgentContext] Failed to get MCP instructions');
    }
    return '';
  }
}

/**
 * Builds stable instructions for an agent by combining agent-specific context and MCP context.
 * Order: baseInstructions -> mcpInstructions
 *
 * @param {Object} params
 * @param {string} [params.baseInstructions] - Agent's base instructions
 * @param {string} [params.mcpInstructions] - Agent's MCP server instructions
 * @returns {string | undefined} Combined instructions, or undefined if empty
 */
export function buildAgentInstructions({
  baseInstructions,
  mcpInstructions,
}: {
  baseInstructions?: string;
  mcpInstructions?: string;
}): string | undefined {
  const parts = [baseInstructions, mcpInstructions].filter(Boolean);
  const combined = parts.join('\n\n').trim();
  return combined || undefined;
}

/**
 * Builds dynamic system-tail instructions for an agent.
 * Order: existing additional instructions -> shared run context.
 */
export function buildAgentAdditionalInstructions({
  additionalInstructions,
  sharedRunContext,
}: {
  additionalInstructions?: string;
  sharedRunContext?: string;
}): string | undefined {
  const parts = [additionalInstructions, sharedRunContext].filter(Boolean);
  const combined = parts.join('\n\n').trim();
  return combined || undefined;
}

/**
 * Applies run context and MCP instructions to an agent's configuration.
 * Mutates the agent object in place.
 *
 * @param {Object} params
 * @param {Agent} params.agent - The agent to update
 * @param {string} params.sharedRunContext - Run-level shared context
 * @param {MCPManager} params.mcpManager - MCP manager instance
 * @param {Object} [params.ephemeralAgent] - Ephemeral agent config (for MCP override)
 * @param {string} [params.agentId] - Agent ID for logging
 * @param {Logger} [params.logger] - Optional logger instance
 * @returns {Promise<void>}
 */
export async function applyContextToAgent({
  agent,
  sharedRunContext,
  mcpManager,
  ephemeralAgent,
  agentId,
  logger,
  configServers,
}: {
  agent: AgentWithTools;
  sharedRunContext: string;
  mcpManager: MCPManager;
  ephemeralAgent?: TEphemeralAgent;
  agentId?: string;
  logger?: Logger;
  configServers?: Record<string, ParsedServerConfig>;
}): Promise<void> {
  const isFileSearchToolName = (name?: string): boolean =>
    typeof name === 'string' && name.includes('file_search');

  const hasFileSearchTool =
    agent?.tools?.some((tool) =>
      typeof tool === 'string' ? isFileSearchToolName(tool) : isFileSearchToolName(tool.name),
    ) ||
    agent?.toolDefinitions?.some((toolDef) => isFileSearchToolName(toolDef.name)) ||
    ephemeralAgent?.file_search === true;

  const baseInstructions = [
    hasFileSearchTool ? FILE_SEARCH_AGENT_INSTRUCTIONS : undefined,
    agent.instructions,
  ]
    .filter(Boolean)
    .join('\n\n');

  const additionalInstructions = agent.additional_instructions ?? undefined;

  try {
    const mcpServers = ephemeralAgent?.mcp?.length ? ephemeralAgent.mcp : extractMCPServers(agent);
    const mcpInstructions = await getMCPInstructionsForServers(
      mcpServers,
      mcpManager,
      logger,
      configServers,
    );

    agent.instructions = buildAgentInstructions({
      baseInstructions,
      mcpInstructions,
    });
    agent.additional_instructions = buildAgentAdditionalInstructions({
      additionalInstructions,
      sharedRunContext,
    });

    if (agentId && logger) {
      logger.debug('[AgentContext] Applied context to agent');
    }
  } catch {
    agent.instructions = buildAgentInstructions({
      baseInstructions,
      mcpInstructions: '',
    });
    agent.additional_instructions = buildAgentAdditionalInstructions({
      additionalInstructions,
      sharedRunContext,
    });

    if (logger) {
      logger.error('[AgentContext] Failed to apply context; using base instructions only');
    }
  }
}
