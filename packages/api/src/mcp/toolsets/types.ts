// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.
import { z } from 'zod';

/** A single toolset's user-facing metadata, as served by the MCP Gateway's `/toolsets` endpoint. */
export interface GatewayToolset {
  name: string;
  description: string;
  userFriendlyDescription: string;
  useCases: string[];
  access: string[];
  limitations: string[];
}

export interface GatewayToolsetListResponse {
  toolsets: GatewayToolset[];
}

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
