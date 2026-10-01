import type { Agents, MCPToolClass } from 'librechat-data-provider';

interface ToolClassAgent {
  toolRegistry?: Map<string, { toolClass?: MCPToolClass }>;
  subagentAgentConfigs?: ToolClassAgent[];
}

/** Adds server-validated MCP classes to matching paused tool approvals. */
export function attachApprovalToolClasses(
  payload: Agents.HumanInterruptPayload,
  agents: ToolClassAgent[],
): Agents.HumanInterruptPayload {
  if (payload.type !== 'tool_approval') {
    return payload;
  }

  const classes = new Map<string, MCPToolClass>();
  const pending = [...agents];
  const visited = new Set<ToolClassAgent>();
  for (let index = 0; index < pending.length; index++) {
    const agent = pending[index];
    if (visited.has(agent)) {
      continue;
    }
    visited.add(agent);
    for (const [name, definition] of agent.toolRegistry ?? []) {
      if (definition.toolClass) {
        classes.set(name, definition.toolClass);
      }
    }
    pending.push(...(agent.subagentAgentConfigs ?? []));
  }

  if (classes.size === 0) {
    return payload;
  }

  return {
    ...payload,
    action_requests: payload.action_requests.map((request: Agents.ToolApprovalRequest) => {
      const toolClass = classes.get(request.name);
      return toolClass ? { ...request, toolClass } : request;
    }),
  };
}
