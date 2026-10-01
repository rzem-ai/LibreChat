/**
 * Deloitte Custom Change: Gateway tool-classification vocabulary shared by the
 * MCP gateway and LibreChat's human-in-the-loop (HITL) approval flow. The
 * gateway assigns a class in each tool's `tools/list` `_meta`, and LibreChat
 * uses it to decide whether a call needs human approval. Defined here, in the
 * leaf data package, so the server and the approval UX cannot drift from each
 * other's vocabulary.
 * See `docs/mcp-tool-classes.md` for the full explanation of the vocabulary
 * and how the gateway assigns classes.
 */
export const MCP_TOOL_CLASSES = ['R1', 'R2', 'R3', 'W1', 'W2', 'W3', 'D'] as const;

export type MCPToolClass = (typeof MCP_TOOL_CLASSES)[number];

const MCP_TOOL_CLASS_SET = new Set<string>(MCP_TOOL_CLASSES);

/**
 * Deloitte Custom Change: Whether a class gates the call behind human approval.
 * Reads (`R*`) are never gated; every write tier and the destructive class are.
 */
export function requiresToolApproval(toolClass: MCPToolClass | undefined): boolean {
  return toolClass === 'W1' || toolClass === 'W2' || toolClass === 'W3' || toolClass === 'D';
}

/**
 * Deloitte Custom Change: Read the gateway's `tool-class` from MCP tool metadata.
 * Malformed or unrecognized values are dropped rather than persisted, so a server
 * can never widen LibreChat's approval decisions by sending an unexpected class.
 */
export function getMCPToolClass(meta: unknown): MCPToolClass | undefined {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
    return undefined;
  }
  const value = (meta as Record<string, unknown>)['tool-class'];
  return typeof value === 'string' && MCP_TOOL_CLASS_SET.has(value)
    ? (value as MCPToolClass)
    : undefined;
}
