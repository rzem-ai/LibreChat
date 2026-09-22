/**
 * MCP Tools Controller
 * Handles MCP-specific tool endpoints, decoupled from regular LibreChat tools
 *
 * @import { MCPServerRegistry } from '@librechat/api'
 * @import { MCPServerDocument } from 'librechat-data-provider'
 */
const { randomUUID } = require('crypto');
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const {
  checkAccess,
  isUserSourced,
  MCPConnection,
  MCPErrorCodes,
  splitMCPToolKey,
  normalizeServerName,
  findShadowedServerNames,
  redactServerSecrets,
  redactAllServerSecrets,
  isMCPDomainNotAllowedError,
  isMCPInspectionFailedError,
  isMCPOAuthSecretReentryRequiredError,
  getUserMCPAuthMap,
  requiresUserScopedConnection,
  // Deloitte Custom Change: reuse the circuit breaker's backoff constant for reinitMCPServerDeduped
  // instead of duplicating the value, aliased to avoid shadowing the per-request `mcpConfig`
  // (resolved server configs) used throughout getMCPTools.
  mcpConfig: mcpCircuitBreakerConfig,
} = require('@librechat/api');
const {
  Constants,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
  MCP_USER_INPUT_FIELDS,
  MCPServerUserInputSchema,
} = require('librechat-data-provider');
const {
  resolveConfigServers,
  resolveMcpConfigNames,
  resolveAllMcpConfigs,
} = require('~/server/services/MCP');
const { cacheMCPServerTools, getMCPServerTools } = require('~/server/services/Config');
const { reinitMCPServer } = require('~/server/services/Tools/mcp'); // Deloitte Custom Change: proactive tool discovery for OBO-scoped servers in getMCPTools
const { getResourcePermissionsMap } = require('~/server/services/PermissionService');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { getMCPManager, getMCPServersRegistry } = require('~/config');
const db = require('~/models');

/**
 * Fields a user without `CONFIGURE_OBO` may modify on an OBO server (allowlist).
 * Any field not on this list is locked: changes to it (add, modify, or remove)
 * require the permission. Allowlisting is fail-closed — when upstream introduces
 * a new MCP server config field, it lands in the locked set by default until
 * explicitly opted in here. Anything that could redirect the OBO token flow
 * (`url`, `proxy`, `headers`), change scopes (`obo`), or reroute auth (`oauth`,
 * `apiKey`, `customUserVars`) MUST stay locked.
 */
const OBO_USER_EDITABLE_FIELDS = new Set([
  'title',
  'description',
  'iconPath',
  'iconPathLight', // Deloitte Custom Change: light/dark themed MCP server icons.
  'iconPathDark', // Deloitte Custom Change: light/dark themed MCP server icons.
]);

/**
 * Deloitte Custom Change: generic, code-keyed messages for `handleMCPError`
 * responses. The client (`getMCPServerErrorMessage`) already maps `error.error`
 * (the code) to a localized string and ignores `error.message`, so these exist
 * only as a non-reflective fallback for any other consumer - never the raw
 * `Error#message`, which can embed request-derived values (domain, server
 * name, field list) and would undermine the Checkmarx XSS remediation below.
 */
const MCP_ERROR_GENERIC_MESSAGES = {
  [MCPErrorCodes.DOMAIN_NOT_ALLOWED]: 'The requested domain is not allowed',
  [MCPErrorCodes.INSPECTION_FAILED]: 'Failed to connect to the MCP server',
  [MCPErrorCodes.OAUTH_SECRET_REENTRY_REQUIRED]: 'OAuth client secret re-entry is required',
};

/** Fallback for any code missing from {@link MCP_ERROR_GENERIC_MESSAGES}, keeping the response shape stable. */
const MCP_ERROR_FALLBACK_MESSAGE = 'An error occurred processing the MCP request';

/**
 * Handles MCP-specific errors and sends appropriate HTTP responses.
 * @param {Error} error - The error to handle
 * @param {import('express').Response} res - Express response object
 * @returns {import('express').Response | null} Response if handled, null if not an MCP error
 */
function handleMCPError(error, res) {
  if (isMCPDomainNotAllowedError(error)) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: MCP_ERROR_GENERIC_MESSAGES[error.code] ?? MCP_ERROR_FALLBACK_MESSAGE,
    });
  }

  if (isMCPInspectionFailedError(error)) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: MCP_ERROR_GENERIC_MESSAGES[error.code] ?? MCP_ERROR_FALLBACK_MESSAGE,
    });
  }

  if (isMCPOAuthSecretReentryRequiredError(error)) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: MCP_ERROR_GENERIC_MESSAGES[error.code] ?? MCP_ERROR_FALLBACK_MESSAGE,
    });
  }

  // Fallback for legacy string-based error handling (backwards compatibility)
  if (error.message?.startsWith(MCPErrorCodes.DOMAIN_NOT_ALLOWED)) {
    return res.status(403).json({
      error: MCPErrorCodes.DOMAIN_NOT_ALLOWED,
      message:
        MCP_ERROR_GENERIC_MESSAGES[MCPErrorCodes.DOMAIN_NOT_ALLOWED] ?? MCP_ERROR_FALLBACK_MESSAGE,
    });
  }

  if (error.message?.startsWith(MCPErrorCodes.INSPECTION_FAILED)) {
    return res.status(400).json({
      error: MCPErrorCodes.INSPECTION_FAILED,
      message:
        MCP_ERROR_GENERIC_MESSAGES[MCPErrorCodes.INSPECTION_FAILED] ?? MCP_ERROR_FALLBACK_MESSAGE,
    });
  }

  if (error.message?.startsWith(MCPErrorCodes.OAUTH_SECRET_REENTRY_REQUIRED)) {
    return res.status(400).json({
      error: MCPErrorCodes.OAUTH_SECRET_REENTRY_REQUIRED,
      message:
        MCP_ERROR_GENERIC_MESSAGES[MCPErrorCodes.OAUTH_SECRET_REENTRY_REQUIRED] ??
        MCP_ERROR_FALLBACK_MESSAGE,
    });
  }

  return null;
}

/**
 * Deloitte Custom Change: reduces a Zod validation error to just the failing
 * field paths, dropping Zod's default issue messages (which can echo the
 * raw submitted value back, e.g. `invalid_literal`/enum mismatches) so
 * user-supplied config values are never reflected in the response body.
 * @param {import('zod').ZodError} zodValidationError - Result of a failed `safeParse`.
 * @returns {string[]} Dot-joined field paths that failed validation, or `'(root)'`
 *   for a root-level issue (empty path).
 */
function getInvalidConfigFieldPaths(zodValidationError) {
  return zodValidationError.errors.map((issue) => issue.path.join('.') || '(root)');
}

/**
 * Deloitte Custom Change: dedupe/backoff state for the `reinitMCPServer` fallback
 * in `getMCPTools`, keyed by `${userId}:${serverName}`. Without this, concurrent
 * page loads (or repeated polling) for the same uncached user-scoped server would
 * each trigger their own connection/token-exchange attempt, and a server that's
 * genuinely down would be retried on every single request. Entries are removed
 * as soon as they resolve (in-flight) or their backoff window elapses (failed),
 * so the map never accumulates stale state.
 */
const reinitAttempts = new Map();
/**
 * Deloitte Custom Change: reuse the circuit breaker's base backoff duration
 * (packages/api/src/mcp/mcpConfig.ts) instead of a separate hardcoded value,
 * so the two cooldowns stay in sync if the env-configured default changes.
 */
const REINIT_FAILURE_BACKOFF_MS = mcpCircuitBreakerConfig.CB_BASE_BACKOFF_MS;

/**
 * Deloitte Custom Change: runs `reinitMCPServer` at most once at a time per
 * user/server, and skips retrying for `REINIT_FAILURE_BACKOFF_MS` after a
 * failure, so concurrent or repeated `getMCPTools` calls for the same
 * uncached user-scoped server don't each trigger their own connection attempt.
 * @param {string} dedupeKey - Identifies the attempt, formatted as `${userId}:${serverName}`.
 * @param {Parameters<typeof reinitMCPServer>[0]} reinitParams - Forwarded as-is to `reinitMCPServer`.
 * @returns {Promise<Awaited<ReturnType<typeof reinitMCPServer>> | null>} The
 *   `reinitMCPServer` result, or `null` if a prior failed attempt is still
 *   within its backoff window (no new attempt is made in that case).
 */
async function reinitMCPServerDeduped(dedupeKey, reinitParams) {
  const existingAttempt = reinitAttempts.get(dedupeKey);
  if (existingAttempt?.promise) {
    return existingAttempt.promise;
  }
  if (existingAttempt?.failedUntil && Date.now() < existingAttempt.failedUntil) {
    return null;
  }

  const attemptPromise = reinitMCPServer(reinitParams).finally(() => {
    const latestAttempt = reinitAttempts.get(dedupeKey);
    if (latestAttempt?.promise === attemptPromise) {
      reinitAttempts.delete(dedupeKey);
    }
  });
  // Deloitte Custom Change: `reinitMCPServer` swallows its own errors and always
  // resolves rather than rejecting, and a resolved `success: true` doesn't
  // guarantee usable tools - `connectionDeferred` (runtime body placeholders)
  // and an OAuth-ready-but-undiscovered flow both resolve `success: true` with
  // `availableTools: null`, and neither will produce tools on a bare retry
  // (they need a chat turn or a completed OAuth flow, not another `/api/mcp/tools`
  // poll). So backoff is keyed on the absence of usable `availableTools` (null,
  // undefined, or an empty map), not `success`, covering rejections, resolved
  // failures, and resolved-but-toolless outcomes (including a genuinely empty
  // tool map, which `getMCPTools` treats the same as "no tools" downstream).
  const registerFailure = () => {
    const failedUntil = Date.now() + REINIT_FAILURE_BACKOFF_MS;
    reinitAttempts.set(dedupeKey, { promise: null, failedUntil });
    // Self-clean so the map doesn't grow unbounded for servers/users that never
    // retry again after the backoff window passes. `unref` is optional-chained
    // since some timer implementations (e.g. Jest's modern fake timers) return a
    // handle without a Node `Timeout`'s `unref` method.
    const cleanupTimer = setTimeout(() => {
      const latestAttempt = reinitAttempts.get(dedupeKey);
      if (latestAttempt?.failedUntil === failedUntil) {
        reinitAttempts.delete(dedupeKey);
      }
    }, REINIT_FAILURE_BACKOFF_MS);
    cleanupTimer?.unref?.();
  };
  attemptPromise.then((result) => {
    if (!result?.availableTools || Object.keys(result.availableTools).length === 0) {
      registerFailure();
    }
  }, registerFailure);
  reinitAttempts.set(dedupeKey, { promise: attemptPromise, failedUntil: 0 });
  return attemptPromise;
}

/**
 * Deloitte Custom Change: cap on simultaneous in-flight tasks in
 * `runWithConcurrency` for `getMCPTools`'s per-server discovery/reinit work,
 * so a page load with many uncached user-scoped servers doesn't fire off a
 * connection attempt for every one of them at once.
 */
const MCP_TOOLS_DISCOVERY_CONCURRENCY = 3;

/**
 * Deloitte Custom Change: runs zero-arg async `tasks` with at most
 * `concurrency` in flight at a time, so one slow/unreachable task (e.g. a
 * live MCP reinitialize attempt) doesn't serially block the rest.
 * @param {Array<() => Promise<unknown>>} tasks
 * @param {number} concurrency
 * @returns {Promise<void>} Resolves once every task has settled; rejections
 *   are caught and logged so one failing task never aborts the others.
 */
async function runWithConcurrency(tasks, concurrency) {
  const executing = new Set();
  for (const task of tasks) {
    const runningTask = task()
      .catch((error) => logger.error('[runWithConcurrency] Task failed', error))
      .finally(() => executing.delete(runningTask));
    executing.add(runningTask);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

/**
 * Get all MCP tools available to the user.
 */
const getMCPTools = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('[getMCPTools] User ID not found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const mcpConfig = await resolveAllMcpConfigs(userId, req.user);
    /**
     * A server whose normalized name is claimed by an earlier server produces
     * IDENTICAL model-facing tool keys — selecting its tools would silently
     * execute against the first server's config (alias resolution is
     * first-wins). Fail closed: never publish a shadowed server's tools.
     */
    const shadowedServers = findShadowedServerNames(Object.keys(mcpConfig));
    for (const shadowedName of shadowedServers) {
      logger.warn(
        `[getMCPTools] Skipping MCP server "${shadowedName}": its normalized name collides with an earlier configured server, making tool keys ambiguous. Rename one server to expose both.`,
      );
    }
    const configuredServers = Object.keys(mcpConfig).filter(
      (serverName) => !shadowedServers.has(serverName),
    );

    if (!configuredServers.length) {
      return res.status(200).json({ servers: {} });
    }

    const mcpManager = getMCPManager();
    const mcpServers = {};

    const serverToolsMap = new Map();
    const cacheResults = await Promise.all(
      configuredServers.map(async (serverName) => {
        try {
          return {
            serverName,
            tools: await getMCPServerTools(userId, serverName, mcpConfig[serverName]),
          };
        } catch (error) {
          logger.error(`[getMCPTools] Error fetching cached tools for ${serverName}:`, error);
          return { serverName, tools: null };
        }
      }),
    );

    // Deloitte Custom Change: lazily resolved (once, however many servers need it
    // concurrently below) only if a server needs the reinitialize fallback.
    let configServersPromise;
    const getConfigServers = () => (configServersPromise ??= resolveConfigServers(req));

    /**
     * Deloitte Custom Change: resolves cached-vs-live tools for one server,
     * establishing a connection via `reinitMCPServerDeduped` when needed. Run
     * with bounded concurrency below (not serially) so one slow/unreachable
     * user-scoped server doesn't hold up discovery for every other server on
     * this request.
     */
    const processServerTools = async (serverName, tools) => {
      if (tools) {
        serverToolsMap.set(serverName, tools);
        return;
      }

      let serverTools;
      try {
        serverTools = await mcpManager.getServerToolFunctions(userId, serverName);
      } catch (error) {
        logger.error(`[getMCPTools] Error fetching tools for server ${serverName}:`, error);
        return;
      }

      // Deloitte Custom Change: reinitMCPServer already caches internally via updateMCPServerTools.
      let alreadyCached = false;
      if (!serverTools && requiresUserScopedConnection(mcpConfig[serverName])) {
        /**
         * Deloitte Custom Change: no cache entry and no existing live connection -
         * the normal state for OBO/user-scoped servers, which never get an
         * app-level connection and otherwise only connect on first chat use.
         * Establish the connection now (mirrors the `/reinitialize` route) so
         * tools appear without requiring a prior chat turn. Scoped to
         * user-scoped servers only - non-user-scoped servers get an app-level
         * connection at startup, so a missing connection here means startup
         * failed or is still in progress, not a case to eagerly retry on
         * every request. Deduped/backed-off per user+server so concurrent or
         * repeated requests don't pile up connection attempts (see
         * reinitMCPServerDeduped). `customUserVars` servers also satisfy
         * `requiresUserScopedConnection`, so their auth map is resolved here
         * too - without it, `reinitMCPServer` always sees the vars as unset
         * and short-circuits as missing, wasting the attempt and backoff
         * window even after the user has configured them.
         */
        try {
          const configServers = await getConfigServers();
          let userMCPAuthMap;
          if (mcpConfig[serverName]?.customUserVars) {
            try {
              userMCPAuthMap = await getUserMCPAuthMap({
                userId,
                servers: [serverName],
                findPluginAuthsByKeys: db.findPluginAuthsByKeys,
              });
            } catch (error) {
              logger.warn(
                `[getMCPTools] Could not resolve customUserVars for ${serverName}:`,
                error,
              );
            }
          }
          const result = await reinitMCPServerDeduped(`${userId}:${serverName}`, {
            user: req.user,
            serverName,
            serverConfig: mcpConfig[serverName],
            configServers,
            userMCPAuthMap,
          });
          serverTools = result?.availableTools ?? null;
          alreadyCached = true;
        } catch (error) {
          logger.error(
            `[getMCPTools] Error establishing connection for server ${serverName}:`,
            error,
          );
        }
      }

      if (!serverTools || Object.keys(serverTools).length === 0) {
        logger.debug(`[getMCPTools] No tools found for server ${serverName}`);
        return;
      }
      serverToolsMap.set(serverName, serverTools);

      if (!alreadyCached) {
        // Cache asynchronously without blocking
        cacheMCPServerTools({
          userId,
          serverName,
          serverTools,
          serverConfig: mcpConfig[serverName],
        }).catch((err) =>
          logger.error(`[getMCPTools] Failed to cache tools for ${serverName}:`, err),
        );
      }
    };

    await runWithConcurrency(
      cacheResults.map(
        ({ serverName, tools }) =>
          () =>
            processServerTools(serverName, tools),
      ),
      MCP_TOOLS_DISCOVERY_CONCURRENCY,
    );

    // Process each configured server
    for (const serverName of configuredServers) {
      try {
        const serverTools = serverToolsMap.get(serverName);

        const serverConfig = mcpConfig[serverName];

        const server = {
          name: serverName,
          icon: serverConfig?.iconPath || '',
          authenticated: true,
          authConfig: [],
          tools: [],
        };

        // Set authentication config once for the server
        if (serverConfig?.customUserVars) {
          const customVarKeys = Object.keys(serverConfig.customUserVars);
          if (customVarKeys.length > 0) {
            server.authConfig = Object.entries(serverConfig.customUserVars).map(([key, value]) => ({
              authField: key,
              label: value.title || key,
              description: value.description || '',
              sensitive: value.sensitive,
            }));
            server.authenticated = false;
          }
        }

        // Process tools efficiently - no need for convertMCPToolToPlugin
        if (serverTools) {
          for (const [toolKey, toolData] of Object.entries(serverTools)) {
            if (!toolData.function || !toolKey.includes(Constants.mcp_delimiter)) {
              continue;
            }

            const [toolName] = splitMCPToolKey(toolKey, [
              serverName,
              normalizeServerName(serverName),
            ]);
            server.tools.push({
              name: toolName,
              pluginKey: toolKey,
              description: toolData.function.description || '',
            });
          }
        }

        // Only add server if it has tools or is configured
        if (server.tools.length > 0 || serverConfig) {
          mcpServers[serverName] = server;
        }
      } catch (error) {
        logger.error(`[getMCPTools] Error loading tools for server ${serverName}:`, error);
      }
    }

    res.status(200).json({ servers: mcpServers });
  } catch (error) {
    logger.error('[getMCPTools]', error);
    res.status(500).json({ message: error.message });
  }
};
/**
 * Mirrors canAccessResource's capability bypass plus per-resource ACL EDIT check.
 * `skipCapabilityWithoutDbIds` lets the list path skip the MANAGE_MCP_SERVERS probe
 * when no DB-backed server is present; no list consumer reads the edit-gated fields
 * the bypass would disclose. The detail route must not set it.
 */
async function computeCanEditByServer(req, serverConfigs, { skipCapabilityWithoutDbIds } = {}) {
  const canEditByServer = new Map();
  const dbIdsToCheck = [];
  const dbIdToServerName = new Map();
  for (const [name, config] of Object.entries(serverConfigs)) {
    if (config.dbId) {
      dbIdsToCheck.push(config.dbId);
      dbIdToServerName.set(String(config.dbId), name);
      continue;
    }
    canEditByServer.set(name, isUserSourced(config));
  }
  if (skipCapabilityWithoutDbIds === true && dbIdsToCheck.length === 0) {
    return canEditByServer;
  }
  let bypass = false;
  try {
    bypass = await hasCapability(req.user, SystemCapabilities.MANAGE_MCP_SERVERS);
  } catch (err) {
    logger.warn(`[computeCanEditByServer] Capability bypass check failed: ${err.message}`);
  }
  if (bypass) {
    for (const name of Object.keys(serverConfigs)) {
      canEditByServer.set(name, true);
    }
    return canEditByServer;
  }
  if (dbIdsToCheck.length > 0) {
    try {
      const permsMap = await getResourcePermissionsMap({
        userId: req.user.id,
        role: req.user.role,
        resourceType: ResourceType.MCPSERVER,
        resourceIds: dbIdsToCheck,
      });
      for (const [dbIdStr, name] of dbIdToServerName) {
        const bits = permsMap.get(dbIdStr) ?? 0;
        canEditByServer.set(name, (bits & PermissionBits.EDIT) !== 0);
      }
    } catch (err) {
      logger.warn(
        `[computeCanEditByServer] ACL lookup failed, defaulting to no edit: ${err.message}`,
      );
      for (const name of dbIdToServerName.values()) {
        canEditByServer.set(name, false);
      }
    }
  }
  return canEditByServer;
}

/**
 * Get all MCP servers with permissions
 * @route GET /api/mcp/servers
 */
const getMCPServersList = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const serverConfigs = await resolveAllMcpConfigs(userId, req.user);
    const canEditByServer = await computeCanEditByServer(req, serverConfigs, {
      skipCapabilityWithoutDbIds: true,
    });
    return res.json(redactAllServerSecrets(serverConfigs, { canEditByServer }));
  } catch (error) {
    logger.error('[getMCPServersList]', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Returns true when the request body's parsed config configures OBO. We block
 * non-permission holders from creating or updating any DB-stored MCP server
 * that mints per-user delegated tokens.
 */
function configHasObo(parsedConfig) {
  return (
    !!parsedConfig &&
    typeof parsedConfig === 'object' &&
    'obo' in parsedConfig &&
    parsedConfig.obo != null
  );
}

/**
 * Returns true when any non-allowlisted user-input field differs between the
 * existing server config and the new payload. Treats add, remove, and modify
 * as changes (stable JSON compare, with absence on either side counting as a
 * change unless both sides are absent). The comparison surface is
 * `MCP_USER_INPUT_FIELDS` (schema-derived from `MCPServerUserInputSchema`),
 * so new fields on the schema are picked up automatically and stay locked
 * by default until added to the allowlist above.
 */
function violatesOboLockdown(existingConfig, newConfig) {
  for (const field of MCP_USER_INPUT_FIELDS) {
    if (OBO_USER_EDITABLE_FIELDS.has(field)) continue;
    const existing = existingConfig?.[field];
    const next = newConfig?.[field];
    if (existing === undefined && next === undefined) continue;
    if (JSON.stringify(existing) !== JSON.stringify(next)) {
      return true;
    }
  }
  return false;
}

async function callerCanConfigureObo(req) {
  return checkAccess({
    req,
    user: req.user,
    permissionType: PermissionTypes.MCP_SERVERS,
    permissions: [Permissions.CONFIGURE_OBO],
    getRoleByName: db.getRoleByName,
  });
}

/**
 * Create MCP server
 * @route POST /api/mcp/servers
 */
const createMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { config } = req.body;

    const validation = MCPServerUserInputSchema.safeParse(config);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Invalid configuration',
        // Deloitte Custom Change: only the failing field paths are returned, not
        // Zod's raw issues, to avoid reflecting submitted config values in the response.
        errors: getInvalidConfigFieldPaths(validation.error),
      });
    }
    if (configHasObo(validation.data) && !(await callerCanConfigureObo(req))) {
      logger.warn(
        `[createMCPServer] User ${userId} attempted to configure OBO without ${Permissions.CONFIGURE_OBO} permission`,
      );
      return res
        .status(403)
        .json({ message: 'Forbidden: Insufficient permissions to configure OBO' });
    }
    /** Reserve both spellings: a generated slug must not collide with a raw
     *  config name OR the normalized form its tool keys actually carry
     *  (deduped — the spellings coincide for safe names). */
    const configNames = await resolveMcpConfigNames(req);
    const reservedServerNames = [
      ...new Set([...configNames, ...configNames.map(normalizeServerName)]),
    ];
    const inspectionServerName = `temp_server_${randomUUID()}`;
    let result;
    try {
      result = await getMCPServersRegistry().addServer(
        inspectionServerName,
        validation.data,
        'DB',
        userId,
        reservedServerNames,
      );
    } finally {
      MCPConnection.clearCooldown(inspectionServerName);
    }
    res.status(201).json({
      serverName: result.serverName,
      ...redactServerSecrets(result.config, { canEdit: true }),
    });
  } catch (error) {
    logger.error('[createMCPServer]', error);
    const mcpErrorResponse = handleMCPError(error, res);
    if (mcpErrorResponse) {
      return mcpErrorResponse;
    }
    // Deloitte Custom Change: generic message - the real error is already logged
    // above, and downstream errors can otherwise echo submitted config values.
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get MCP server by ID
 */
const getMCPServerById = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { serverName } = req.params;
    if (!serverName) {
      return res.status(400).json({ message: 'Server name is required' });
    }
    const configServers = await resolveConfigServers(req);
    const parsedConfig = await getMCPServersRegistry().getServerConfig(
      serverName,
      userId,
      configServers,
    );

    if (!parsedConfig) {
      return res.status(404).json({ message: 'MCP server not found' });
    }

    const canEditMap = await computeCanEditByServer(req, { [serverName]: parsedConfig });
    const canEdit = canEditMap.get(serverName) ?? false;
    res.status(200).json(redactServerSecrets(parsedConfig, { canEdit }));
  } catch (error) {
    logger.error('[getMCPServerById]', error);
    // Deloitte Custom Change: generic message - the real error is already logged above.
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update MCP server
 * @route PATCH /api/mcp/servers/:serverName
 */
const updateMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { serverName } = req.params;
    const { config } = req.body;

    const validation = MCPServerUserInputSchema.safeParse(config);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Invalid configuration',
        // Deloitte Custom Change: only the failing field paths are returned, not
        // Zod's raw issues, to avoid reflecting submitted config values in the response.
        errors: getInvalidConfigFieldPaths(validation.error),
      });
    }

    /**
     * On an existing OBO server, lock down every user-input field except the
     * cosmetic allowlist (title, description, iconPath) for callers without
     * CONFIGURE_OBO. This closes the OBO redirect vector — without it, a user
     * with UPDATE could change `url` (or `proxy`/`headers`/`customUserVars`)
     * to point OBO-minted tokens at an attacker-controlled endpoint. Adds,
     * modifies, and removes are all caught.
     */
    const existingConfig = await getMCPServersRegistry().getServerConfig(serverName, userId);
    if (configHasObo(existingConfig) && !(await callerCanConfigureObo(req))) {
      if (violatesOboLockdown(existingConfig, validation.data)) {
        logger.warn(
          `[updateMCPServer] User ${userId} attempted to modify a locked field on OBO server '${serverName}' without ${Permissions.CONFIGURE_OBO} permission`,
        );
        return res
          .status(403)
          .json({ message: 'Forbidden: Insufficient permissions to configure OBO' });
      }
    } else if (configHasObo(validation.data) && !(await callerCanConfigureObo(req))) {
      // Adding OBO to a non-OBO server (or first-time configuration) still
      // requires the permission, even if existing has no OBO.
      logger.warn(
        `[updateMCPServer] User ${userId} attempted to add OBO to '${serverName}' without ${Permissions.CONFIGURE_OBO} permission`,
      );
      return res
        .status(403)
        .json({ message: 'Forbidden: Insufficient permissions to configure OBO' });
    }

    const parsedConfig = await getMCPServersRegistry().updateServer(
      serverName,
      validation.data,
      'DB',
      userId,
    );

    res.status(200).json(redactServerSecrets(parsedConfig, { canEdit: true }));
  } catch (error) {
    logger.error('[updateMCPServer]', error);
    const mcpErrorResponse = handleMCPError(error, res);
    if (mcpErrorResponse) {
      return mcpErrorResponse;
    }
    // Deloitte Custom Change: generic message - the real error is already logged
    // above, and downstream errors can otherwise echo submitted config values.
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Delete MCP server
 * @route DELETE /api/mcp/servers/:serverName
 */
const deleteMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { serverName } = req.params;
    await getMCPServersRegistry().removeServer(serverName, 'DB', userId);
    res.status(200).json({ message: 'MCP server deleted successfully' });
  } catch (error) {
    logger.error('[deleteMCPServer]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMCPTools,
  getMCPServersList,
  createMCPServerController,
  getMCPServerById,
  updateMCPServerController,
  deleteMCPServerController,
};
