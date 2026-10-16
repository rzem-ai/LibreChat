// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.
import { z } from 'zod';
import type { MCPToolsetDetails } from 'librechat-data-provider';

/** A single toolset's user-facing metadata, as served by the MCP Gateway's `/toolsets` endpoint. */
export type GatewayToolset = MCPToolsetDetails;

export type GatewayToolsetListResponse = { toolsets: GatewayToolset[] };

export const GatewayToolsetSchema: z.ZodType<GatewayToolset> = z.object({
  name: z.string(),
  description: z.string(),
  userFriendlyDescription: z.string(),
  useCases: z.array(z.string()),
  access: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const GatewayToolsetListResponseSchema: z.ZodType<GatewayToolsetListResponse> = z.object({
  toolsets: z.array(GatewayToolsetSchema),
});
