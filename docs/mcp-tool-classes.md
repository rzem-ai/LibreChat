# MCP Gateway Tool Classes

## Purpose

The MCP gateway (`ea-mcp-gateway`) can classify each tool it exposes so that Human-in-the-Loop (HITL) approval decisions can be made consistently across the product. The classification is delivered in the tool's `tools/list` `_meta` block and carried through LibreChat's discovery, registry and approval pipelines.

## The vocabulary

A tool class is a short stable string:

| Class | Meaning |
| --- | --- |
| `R1`, `R2`, `R3` | Read-only operations (query, fetch, list). Never gated behind human approval. |
| `W1`, `W2`, `W3` | Write operations of increasing blast radius. All gated behind human approval. |
| `D` | Destructive operations (delete, overwrite, purge). Gated behind human approval. |

The canonical list lives in `packages/data-provider/src/mcpToolClass.ts` (`MCP_TOOL_CLASSES`). The R/W tier digits are defined by the gateway; LibreChat only distributes them and applies the approval gating rule.

## How the gateway assigns a class

The gateway attaches the class to each tool it advertises:

```json
{
  "name": "create_folder",
  "inputSchema": { "type": "object", "properties": {} },
  "_meta": { "tool-class": "W1" }
}
```

LibreChat accepts a class only if it is one of the known vocabulary values. Malformed or unknown values are dropped rather than persisted, so a gateway can never widen approval behaviour by sending an unexpected class.

## What LibreChat does with it

1. **Discovery** — `MCPServerInspector.getToolFunctions` and `updateMCPServerTools` (`packages/api/src/mcp/tools.ts`) read `_meta['tool-class']` via `getMCPToolClass` and attach the validated value to the tool's `LCFunctionTool` definition.
2. **Definitions / registry** — the class is carried through `loadToolDefinitions` (`packages/api/src/tools/definitions.ts`, both single-tool and "all tools from this server" pins), the tool classification registry, and the runtime tool instance (`mcpToolClass`).
3. **Approval payload** — when a tool call is paused for human approval, the server stamps each `action_requests` entry with the class from the runtime `toolRegistry` (`api/server/controllers/agents/client.js`). The class is never taken from client data.
4. **Message part** — the client persists the class on the approval part (`client/src/utils/approval.ts`) so the approval UI can decide how to present the call.

## Approval gating rule

`requiresToolApproval(toolClass)` in `packages/data-provider/src/mcpToolClass.ts` decides gating: write tiers (`W1`/`W2`/`W3`) and the destructive class (`D`) require human approval; the read tiers (`R1`/`R2`/`R3`) never do. Tools without a class behave exactly as before (prompt-only approval).

## Adding classes for a new MCP

1. Gateway: emit `_meta: { "tool-class": "<class>" }` on every tool in the MCP's `tools/list`.
2. LibreChat: no code change needed — any value in `MCP_TOOL_CLASSES` is picked up automatically.
3. If a new class value is needed, add it to `MCP_TOOL_CLASSES` and to the `requiresToolApproval` gating rule, then update this page.

## Source of truth

- Vocabulary + validation + gating rule: `packages/data-provider/src/mcpToolClass.ts`
- Transport and approval plumbing: see the PR "FEAT: MCP tool-class groundwork for HITL approval".