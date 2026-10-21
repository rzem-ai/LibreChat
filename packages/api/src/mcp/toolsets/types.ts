// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.
import { z } from 'zod';
import type { MCPToolsetDetails } from 'librechat-data-provider';

/** A single toolset's user-facing metadata, as served by the MCP Gateway's `/toolsets` endpoint. */
export type GatewayToolset = MCPToolsetDetails;

/** List fields default to `[]` so a toolset the gateway omits them from still renders. */
export const GatewayToolsetSchema: z.ZodType<GatewayToolset, z.ZodTypeDef, unknown> = z.object({
  name: z.string(),
  description: z.string(),
  userFriendlyDescription: z.string(),
  useCases: z.array(z.string()).default([]),
  access: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

/** Toolsets are validated individually by the client so one bad entry cannot drop the rest. */
export const GatewayToolsetListResponseSchema: z.ZodType<{ toolsets: unknown[] }> = z.object({
  toolsets: z.array(z.unknown()),
});
