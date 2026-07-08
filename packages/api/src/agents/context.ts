import { Constants } from 'librechat-data-provider';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { Agent, TEphemeralAgent } from 'librechat-data-provider';
import type { LCTool } from '@librechat/agents';
import type { Logger } from 'winston';
import type { ParsedServerConfig } from '~/mcp/types';
import type { MCPManager } from '~/mcp/MCPManager';

/**
 * Nudges the model to actually call file_search before answering, so retrieval
 * happens and grounds the response in the attached documents. End-of-trace
 * citations depend on this: `applyEndOfTraceCitations` can only anchor sentences
 * to sources the file_search tool retrieved, so if the model skips the tool
 * there is nothing to cite. This purposefully omits any anchor-emission
 * instructions — citations are inserted deterministically after the run rather
 * than relying on the model to echo markers, which was unreliable and could
 * degrade answer quality.
 */
const FILE_SEARCH_AGENT_INSTRUCTIONS =
  'If the file_search tool is available and documents are attached for this conversation, call file_search before answering any substantive question — even one that appears answerable from general knowledge — because the attached documents may contain organization-specific definitions, policies, or details that supersede or supplement what you already know. Prefer searching over assuming. Only skip file_search for purely conversational messages such as greetings or small talk. If file_search is unavailable or no documents are attached, answer normally without attempting tool calls.';

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
        const serverName = tool.name.split(Constants.mcp_delimiter).pop();
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
        const serverName = toolDef.name.split(Constants.mcp_delimiter).pop();
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
      logger.debug('[AgentContext] Fetched MCP instructions for servers:', mcpServers);
    }
    return mcpInstructions || '';
  } catch (error) {
    if (logger) {
      logger.error('[AgentContext] Failed to get MCP instructions:', error);
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
      logger.debug(`[AgentContext] Applied context to agent: ${agentId}`);
    }
  } catch (error) {
    agent.instructions = buildAgentInstructions({
      baseInstructions,
      mcpInstructions: '',
    });
    agent.additional_instructions = buildAgentAdditionalInstructions({
      additionalInstructions,
      sharedRunContext,
    });

    if (logger) {
      logger.error(
        `[AgentContext] Failed to apply context to agent${agentId ? ` ${agentId}` : ''}, using base instructions only:`,
        error,
      );
    }
  }
}