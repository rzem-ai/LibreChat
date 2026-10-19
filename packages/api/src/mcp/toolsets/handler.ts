// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.
import { logger } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { OboTokenResolver, UpstreamTokenProvider } from '~/mcp/oauth/obo';
import type { AuthIdentityContext } from '~/utils/identity';
import type { ServerRequest } from '~/types';
import { createAuthIdentityContext } from '~/utils/identity';
import { resolveOboToken } from '~/mcp/oauth/obo';
import { GatewayToolsetsError } from './errors';
import { fetchAndCacheToolsets, getCachedToolsets } from './service';

export interface ToolsetsHandlerDeps {
  getTenantId: () => string | undefined;
  exchangeOboToken: OboTokenResolver;
  createUpstreamTokenProvider: (args: {
    req: ServerRequest;
    res: Response;
    identityContext: AuthIdentityContext;
  }) => UpstreamTokenProvider;
  resolveAllowlists: (args: { userId: string; role?: string }) => Promise<{
    allowedDomains?: string[] | null;
    allowedAddresses?: string[] | null;
  }>;
}

/**
 * Builds the `GET /api/mcp/toolsets` handler. Unauthenticated callers get 401; a per-user cache hit
 * is served before any token exchange. A missing gateway config or any operational failure
 * (OBO exchange, allowlist, gateway) is reported with a safe non-2xx status rather than an empty
 * catalogue, so clients can tell an outage from "no toolsets".
 */
export function createGetMCPToolsets(deps: ToolsetsHandlerDeps) {
  async function resolveToolsets(req: ServerRequest, res: Response, userId: string) {
    const cached = await getCachedToolsets(userId);
    if (cached) {
      return cached;
    }
    const gatewayUrl = process.env.MCP_GATEWAY_URL;
    const oboScope = process.env.MCP_GATEWAY_OBO_SCOPE;
    if (!gatewayUrl || !oboScope) {
      throw new GatewayToolsetsError(503, 'MCP Gateway toolsets are not configured');
    }
    const user = req.user!;
    const identityContext = createAuthIdentityContext({ user, tenantId: deps.getTenantId() });
    const oboTokens = await resolveOboToken(
      user,
      { scopes: oboScope },
      deps.exchangeOboToken,
      deps.createUpstreamTokenProvider({ req, res, identityContext }),
      identityContext,
    );
    const { allowedDomains, allowedAddresses } = await deps.resolveAllowlists({
      userId,
      role: user.role,
    });
    return fetchAndCacheToolsets({
      userId,
      gatewayUrl,
      bearerToken: oboTokens.access_token,
      allowedDomains,
      allowedAddresses,
    });
  }

  return async function getMCPToolsets(req: ServerRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    try {
      res.status(200).json({ toolsets: await resolveToolsets(req, res, userId) });
    } catch (error) {
      logger.warn('[getMCPToolsets] Failed to resolve MCP Gateway toolsets', error);
      if (res.headersSent) {
        return;
      }
      const status = error instanceof GatewayToolsetsError ? error.status : 502;
      const message =
        error instanceof GatewayToolsetsError
          ? error.message
          : 'Failed to load MCP Gateway toolsets';
      res.status(status).json({ message });
    }
  };
}
