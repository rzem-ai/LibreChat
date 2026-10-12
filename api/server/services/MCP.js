const { tool } = require('@librechat/agents/langchain/tools');
const { logger, getTenantId } = require('@librechat/data-schemas');
const { Providers, Constants: AgentConstants } = require('@librechat/agents');
const {
  sendEvent,
  PENDING_STALE_MS,
  MCPOAuthHandler,
  MCPTokenStorage,
  isMCPDomainAllowed,
  splitMCPToolKey,
  normalizeServerName,
  normalizeMCPToolKey,
  stripServerNamePrefix,
  stripServerNamePrefixes,
  buildServerNameAliases,
  findShadowedServerNames,
  getAssistantToolDefinitions: loadAssistantToolDefinitions,
  toProviderToolDefinition,
  resolveMCPServerContext,
  normalizeJsonSchema,
  GenerationJobManager,
  resolveJsonSchemaRefs,
  sanitizeGeminiSchema,
  buildMCPAuthStepId,
  buildMCPAuthToolCall,
  processMCPEnv,
  preProcessGraphTokens,
  buildMCPAuthRunStepEvent,
  buildMCPAuthRunStepDeltaEvent,
  buildMCPAuthRunStepEndDeltaEvent,
  isUserSourced,
  hasCustomUserVars,
  checkAccessWithRequestCache,
  getMissingCustomUserVars,
  getUserMCPAuthMap,
  getServerCustomUserVars,
  requiresEphemeralUserConnection,
  requiresOAuthMachinery,
  hasRuntimeUrlPlaceholders,
  containsGraphTokenPlaceholder,
  createAuthIdentityContext,
  isOAuthServer,
  // Deloitte Custom Change: OBO server detection plus code-interpreter file
  // authoring helpers used by the sandbox file bridge below.
  isOboServer,
  sanitizeFilename,
  fetchAllowedCodeFileStream,
  HOST_FILE_AUTHORING_ARTIFACT_KEY,
  filterMCPConfigByEntraGroups,
  filterMCPConfigForUser,
  isAbortError,
  isDirectOpenIDBearerRecoveryEnabled,
  buildMCPDomainValidationConfig,
  OpenIDReauthRequiredError,
  MCPAuthenticationRefreshError,
  MCPAuthenticationRejectedError,
  prepareMCPAuthorizationMutation,
  supportsAttachmentUpload,
  getAttachmentSourceField,
  resolveAttachmentUpload: resolveAttachmentUploadCore,
  addAttachmentUploadHints,
  getThreadData,
  readStreamAsBase64,
} = require('@librechat/api');
const { extractOpenIDTokenInfo, isOpenIDTokenValid } = require('@librechat/api');
const {
  Time,
  CacheKeys,
  Constants,
  Permissions,
  PermissionTypes,
  AgentCapabilities,
  EModelEndpoint,
  checkOpenAIStorage,
  mergeFileConfig,
  getEndpointFileConfig,
  isAssistantsEndpoint,
  FileSources,
} = require('librechat-data-provider');
const {
  getOAuthReconnectionManager,
  getMCPServersRegistry,
  getFlowStateManager,
  getMCPManager,
} = require('~/config');
const db = require('~/models');
const { findToken, createToken, updateToken, deleteTokens, findPluginAuthsByKeys } = db;
const { getGraphApiToken } = require('./GraphTokenService');
const { exchangeOboToken } = require('./OboTokenService');
const { createOboTrustChecker } = require('./OboPolicyService');
const { createOpenIDSessionTokenProvider } = require('./OpenIDSessionRefresh');
const { reinitMCPServer } = require('./Tools/mcp');
const {
  getAppConfig,
  checkCapability,
  getCachedTools,
  getMCPServerTools,
  cacheMCPServerTools,
  invalidateCachedTools,
} = require('./Config');
const { getStrategyFunctions } = require('./Files/strategies');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { Readable } = require('stream');
const { getLogStores } = require('~/cache');
// Deloitte Custom Change: bridges MCP tool output into Code Interpreter's sandbox file system.
const { uploadCodeEnvFile } = require('~/server/services/Files/Code/crud');
const {
  clearMCPAuthorizationFenceRetry,
  persistMCPAuthorizationFenceRetry,
} = require('./MCPAuthorizationFenceRetry');

const MAX_CACHE_SIZE = 1000;
const lastReconnectAttempts = new Map();
const RECONNECT_THROTTLE_MS = 10_000;

const missingToolCache = new Map();
const MISSING_TOOL_TTL_MS = 10_000;
function applyAttachmentUploadConfig(serverConfig, serverName, appConfig) {
  if (!serverConfig || serverConfig.source === 'user') {
    return serverConfig;
  }

  const attachmentUploadTools = appConfig?.mcpConfig?.[serverName]?.attachmentUploadTools;
  if (!Array.isArray(attachmentUploadTools)) {
    return serverConfig;
  }

  // Deloitte Custom Change: retain the trusted YAML allowlist when inspected server configs omit it.
  return { ...serverConfig, attachmentUploadTools };
}

/**
 * Deloitte Custom Change: Resolve generated files only from the current user's active conversation thread.
 * @param {import('@librechat/api').RequestBody | undefined} requestBody - Current request body.
 * @param {import('librechat-data-provider').TUser | undefined} user - Current authenticated user.
 * @returns {Promise<object[]>} Conversation files that belong to the current user.
 */
async function getConversationFiles(requestBody, user) {
  if (!requestBody?.conversationId || !requestBody?.parentMessageId || !user?.id) {
    return [];
  }
  const messages = await db.getMessages(
    { conversationId: requestBody.conversationId, user: user.id },
    'messageId parentMessageId files attachments',
  );
  const { fileIds } = getThreadData(messages ?? [], requestBody.parentMessageId);
  const threadFiles =
    (await db.getCodeGeneratedFiles(requestBody.conversationId, fileIds, {
      userId: user.id,
      tenantId: getTenantId(),
    })) ?? [];
  // Deloitte Custom Change: a file generated earlier in THIS still-in-progress
  // turn has no saved message yet, so `getThreadData` above can't see it via
  // the thread's persisted `files`/`attachments`. Match it directly by the
  // in-flight response message id so "generate, then upload" works in one turn.
  if (!requestBody.messageId) {
    return threadFiles;
  }
  const currentTurnFiles =
    (await db.getFiles(
      {
        conversationId: requestBody.conversationId,
        user: user.id,
        tenantId: getTenantId(),
        context: 'execute_code',
        messageId: requestBody.messageId,
        'metadata.codeEnvRef': { $exists: true },
      },
      null,
      { text: 0 },
    )) ?? [];
  const seenFileIds = new Set(threadFiles.map((file) => file.file_id));
  return [...threadFiles, ...currentTurnFiles.filter((file) => !seenFileIds.has(file.file_id))];
}

/**
 * Deloitte Custom Change: Resolve an authorized attachment's bytes from whichever storage
 * backend actually holds them, so upload tools never need provider-specific download logic.
 * Returns a Node-readable stream for an authorized persisted file.
 * OpenAI and Azure files require an endpoint-specific client; other storage
 * strategies use the standard request/path stream signature.
 * @param {object} attachment - Persisted file document.
 * @param {ServerRequest | undefined} req - Authenticated request.
 * @param {import('express').Response | undefined} res - Active response.
 * @returns {Promise<NodeJS.ReadableStream>} Download stream for the file.
 */
async function getAttachmentDownloadStream(attachment, req, res) {
  const ref = attachment.metadata?.codeEnvRef;
  if (
    attachment.context === 'execute_code' &&
    ref?.storage_session_id &&
    ref?.file_id &&
    ref?.kind &&
    ref?.id
  ) {
    const identity =
      ref.kind === 'skill'
        ? { kind: ref.kind, id: ref.id, version: ref.version }
        : { kind: ref.kind, id: ref.id };
    const { getDownloadStream: getCodeStream } = getStrategyFunctions(FileSources.execute_code);
    if (typeof getCodeStream === 'function') {
      try {
        const response = await getCodeStream(
          `${ref.storage_session_id}/${ref.file_id}`,
          identity,
          req,
        );
        return response.data;
      } catch (error) {
        logger.warn(
          '[MCP] Code environment download unavailable; using durable file storage',
          error,
        );
      }
    }
  }
  const { getDownloadStream } = getStrategyFunctions(attachment.source);
  if (typeof getDownloadStream !== 'function') {
    throw new Error(`Attached file source "${attachment.source}" cannot be downloaded`);
  }
  if (checkOpenAIStorage(attachment.source)) {
    if (!attachment.model) {
      throw new Error(`Attached file source "${attachment.source}" has no associated model`);
    }
    const endpointMap = {
      [FileSources.openai]: EModelEndpoint.assistants,
      [FileSources.azure]: EModelEndpoint.azureAssistants,
    };
    const providerReq = Object.assign(Object.create(req ?? null), {
      body: { ...req?.body, model: attachment.model },
    });
    const { openai } = await getOpenAIClient({
      req: providerReq,
      res,
      overrideEndpoint: endpointMap[attachment.source],
    });
    const response = await getDownloadStream(attachment.file_id, openai);
    return response.body && typeof response.body.getReader === 'function'
      ? Readable.fromWeb(response.body)
      : response.body;
  }
  const download = await getDownloadStream(req, attachment.storageKey || attachment.filepath);
  return download?.data ?? download;
}

/**
 * Deloitte Custom Change: Resolve only files attached to the active request before tool dispatch.
 * Resolves a current-request attachment for an authorized MCP upload tool.
 * @param {object} params - Upload resolution inputs.
 * @param {object | string} params.toolArguments - Arguments generated for the MCP tool.
 * @param {import('@librechat/api').RequestBody | undefined} params.requestBody - Current request body.
 * @param {ServerRequest | undefined} params.req - Current authenticated request.
 * @param {import('librechat-data-provider').TUser | undefined} params.user - Current authenticated user.
 * @returns {Promise<object | string>} Tool arguments with attachment bytes substituted when requested.
 */
async function resolveAttachmentUpload({ toolArguments, requestBody, req, res, user, signal }) {
  const requestFileIds = new Set(
    (requestBody?.files ?? [])
      .map((file) => file?.file_id)
      .filter((fileId) => typeof fileId === 'string'),
  );
  return resolveAttachmentUploadCore({
    toolArguments,
    signal,
    dependencies: {
      getRequestAttachment: async (fileId) =>
        requestFileIds.has(fileId)
          ? ((await db.getFiles(
              { file_id: fileId, user: user?.id, tenantId: getTenantId() },
              null,
              { text: 0 },
            )) ?? [])
          : [],
      getThreadFiles: () => getConversationFiles(requestBody, user),
      getDownloadStream: (attachment) => getAttachmentDownloadStream(attachment, req, res),
    },
  });
}

/**
 * Deloitte Custom Change: applies the standard Agents file policy before a trusted gateway file is downloaded.
 */
function validateGatewayCodeFile({ req, mimeType, size }) {
  const fileConfig = mergeFileConfig(req.config?.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    endpoint: EModelEndpoint.agents,
    fileConfig,
  });
  const fileSizeLimit = endpointFileConfig.fileSizeLimit ?? fileConfig.serverFileSizeLimit;

  if (endpointFileConfig.disabled) {
    throw new Error('Code Interpreter file uploads are disabled for Agents');
  }
  if (!Number.isSafeInteger(size) || size < 0 || size > fileSizeLimit) {
    throw new Error('Gateway file exceeds the configured Agents file size limit');
  }
  if (!mimeType || !fileConfig.checkType(mimeType, endpointFileConfig.supportedMimeTypes)) {
    throw new Error(`Unsupported codeFile MIME type: ${mimeType}`);
  }
}

/**
 * Deloitte Custom Change: derives a display-only type label from a sanitized filename.
 *
 * @param {unknown} filename - Sanitized Code Interpreter attachment filename.
 * @returns {string} Uppercase extension label, or a generic file label.
 */
function getCodeFileTypeLabel(filename) {
  const extension =
    typeof filename === 'string' ? filename.match(/\.([a-z0-9]+)$/i)?.[1] : undefined;
  return extension ? `${extension.toUpperCase()} file` : 'file';
}

/**
 * Deloitte Custom Change: returns the approved agent-facing timeout guidance.
 *
 * @param {string} fileType - Display-only file type label.
 * @returns {string} Safe attachment timeout guidance.
 */
function getUploadTimeoutMessage(fileType) {
  if (fileType === 'XLSX file') {
    return "The XLSX file is too large to upload right now - please try a file under 1MB. We're actively working to increase this limit.";
  }
  return "The file upload timed out. Please try again with a smaller file (under 1MB). We're actively working to increase the size limit.";
}

function formatFileSizeLimit(maxFileSizeBytes) {
  const megabyte = 1024 * 1024;
  if (maxFileSizeBytes % megabyte === 0) {
    return `${maxFileSizeBytes / megabyte} MB`;
  }
  return `${maxFileSizeBytes} bytes`;
}

/**
 * Deloitte Custom Change: maps trusted upload failures to agent-safe guidance
 * without exposing signed URLs, response bodies, or infrastructure details.
 *
 * @param {unknown} error - Code Interpreter attachment error.
 * @param {string} filename - Sanitized attachment filename.
 * @returns {string} Agent-visible attachment failure reason.
 */
function getCodeFileAttachmentFailureReason(error, filename) {
  const fileType = getCodeFileTypeLabel(filename);
  const codeRuntimeFailure = error?.codeRuntimeUploadFailure;
  if (
    codeRuntimeFailure?.code === 'upload_timeout' &&
    Number.isSafeInteger(codeRuntimeFailure.timeoutSeconds)
  ) {
    return getUploadTimeoutMessage(fileType);
  }
  if (
    codeRuntimeFailure?.code === 'upload_size_limit' &&
    Number.isSafeInteger(codeRuntimeFailure.maxFileSizeBytes)
  ) {
    const limit = formatFileSizeLimit(codeRuntimeFailure.maxFileSizeBytes);
    return `The ${fileType} is too large to attach to Code Interpreter. Please use a smaller ${fileType} (under ${limit}).`;
  }

  const message = typeof error?.message === 'string' ? error.message : '';
  const status = message.match(/\bstatus(?: code)?\s+(\d{3})\b/i)?.[1];

  if (error?.codeRuntimeUploadError === true && status === '504') {
    return getUploadTimeoutMessage(fileType);
  }
  if (message.includes('exceeds the configured Agents file size limit')) {
    return 'The file exceeds the configured size limit for Code Interpreter.';
  }
  if (message.includes('Unsupported codeFile MIME type')) {
    return 'The file type is not supported by Code Interpreter.';
  }
  if (message.includes('file uploads are disabled')) {
    return 'Code Interpreter file uploads are disabled for this agent.';
  }

  return 'The file transfer to Code Interpreter failed.';
}

async function userCanUseMCPServers(user, req) {
  if (!user?.id || !user?.role) {
    return false;
  }

  try {
    return await checkAccessWithRequestCache({
      req,
      user,
      permissionType: PermissionTypes.MCP_SERVERS,
      permissions: [Permissions.USE],
      getRoleByName: db.getRoleByName,
    });
  } catch {
    logger.error(`[MCP][User: ${user.id}] Failed MCP permission check`);
    return false;
  }
}

function createMCPPermissionContext(req) {
  return {
    canUseServers: (user = req?.user) => userCanUseMCPServers(user, req),
  };
}

function evictStale(map, ttl) {
  if (map.size <= MAX_CACHE_SIZE) {
    return;
  }
  const now = Date.now();
  for (const [key, timestamp] of map) {
    if (now - timestamp >= ttl) {
      map.delete(key);
    }
    if (map.size <= MAX_CACHE_SIZE) {
      return;
    }
  }
}

const unavailableMsg =
  "This tool's MCP server is temporarily unavailable. Please try again shortly.";

function getOAuthFlowId(userId, serverName, tenantId = getTenantId()) {
  if (!tenantId) {
    return MCPOAuthHandler.generateFlowId(userId, serverName);
  }
  return MCPOAuthHandler.generateFlowId(userId, serverName, tenantId);
}

async function getAppConfigForRequest(req) {
  const user = req?.user;
  return await getAppConfigForUser(user?.id, user);
}

async function getAppConfigForUser(userId, user) {
  const appConfig = await getAppConfig({ role: user?.role, tenantId: getTenantId(), userId });
  return await filterAppConfigMCPServers(appConfig, user ?? { id: userId });
}

async function filterAppConfigMCPServers(appConfig, user) {
  const mcpConfig = appConfig?.mcpConfig;
  const getEntraGroupIds = async (userId) => {
    let groups;
    try {
      groups = await db.findGroupsByMemberId(userId);
    } catch (error) {
      logger.warn(
        '[MCP] Failed to resolve Entra group membership; restricted servers are hidden',
        error,
      );
      throw error;
    }
    return groups
      .filter((group) => group.source === 'entra' && typeof group.idOnTheSource === 'string')
      .map((group) => group.idOnTheSource);
  };
  try {
    return {
      ...appConfig,
      mcpConfig: await filterMCPConfigForUser(mcpConfig ?? {}, user?.id, getEntraGroupIds),
    };
  } catch {
    return { ...appConfig, mcpConfig: filterMCPConfigByEntraGroups(mcpConfig, []) };
  }
}

/**
 * Resolves config-source MCP servers from admin Config overrides for the current
 * request context. Returns the parsed configs keyed by server name.
 * @param {import('express').Request} req - Express request with user context
 * @returns {Promise<Record<string, import('@librechat/api').ParsedServerConfig>>}
 */
async function resolveConfigServers(req) {
  try {
    const registry = getMCPServersRegistry();
    const appConfig = await getAppConfigForRequest(req);
    return await registry.ensureConfigServers(appConfig?.mcpConfig || {});
  } catch {
    logger.warn('[resolveConfigServers] Failed to resolve config servers; degrading to empty');
    return {};
  }
}

/**
 * Resolves operator-managed MCP server names from admin Config overrides for the current request.
 * Returns a request-time snapshot for DB server creation, not a cross-process lock.
 * @throws Propagates app config lookup errors to keep DB server creation fail-closed.
 * @param {import('express').Request} req - Express request with user context
 * @returns {Promise<string[]>}
 */
async function resolveMcpConfigNames(req) {
  const appConfig = await getAppConfigForRequest(req);
  return Object.keys(appConfig?.mcpConfig || {});
}

/**
 * All configured server names in the normalized form tool keys are built with.
 * Unlike `resolveConfigServers`, this keeps unmodified YAML servers, which
 * `ensureConfigServers` skips - those are exactly the ones that must still
 * resolve the tool-key boundary.
 * @param {import('express').Request} req
 * @returns {Promise<string[]>}
 */
async function resolveMcpServerNames(req) {
  try {
    const names = await resolveMcpConfigNames(req);
    return names.map(normalizeServerName);
  } catch (error) {
    logger.warn(
      '[resolveMcpServerNames] Failed to resolve server names, degrading to empty:',
      error,
    );
    return [];
  }
}

/**
 * Config-source servers and all configured names from a single app-config read,
 * so the tool-loading path does not pay two lookups for the same principal.
 * Degrades to empty like `resolveConfigServers` rather than aborting tool loading.
 * @param {import('express').Request} req
 * @returns {Promise<{ configServers: Record<string, import('@librechat/api').ParsedServerConfig>, serverNames: string[] }>}
 */
async function resolveMcpServerContext(req) {
  try {
    const appConfig = await getAppConfigForRequest(req);
    return await resolveMCPServerContext({
      mcpConfig: appConfig?.mcpConfig || {},
      ensureConfigServers: (mcpConfig) => getMCPServersRegistry().ensureConfigServers(mcpConfig),
    });
  } catch (error) {
    logger.warn(
      '[resolveMcpServerContext] Failed to resolve MCP servers, degrading to empty:',
      error,
    );
    return { configServers: {}, serverNames: [], rawServerNames: [] };
  }
}

/**
 * Resolves config-source servers and merges all server configs (YAML + config + user DB)
 * for the given user context. Shared helper for controllers needing the full merged config.
 * @param {string} userId
 * @param {{ id?: string, role?: string }} [user]
 * @returns {Promise<Record<string, import('@librechat/api').ParsedServerConfig>>}
 */
/**
 * Names of every MCP server the user can reach (operator config + user DB),
 * for legacy-key healing: collision detection in `initializeAgent` (consulted
 * when a configured server name needs normalization) and the assistants heal
 * in `healMcpToolNames` (always, since assistants reference user-owned
 * servers too).
 * @param {string} [userId]
 * @param {string} [role]
 * @returns {Promise<string[]>}
 */
async function getAccessibleMcpServerNames(userId, role) {
  const configs = await resolveAllMcpConfigs(
    userId,
    role != null ? { id: userId, role } : { id: userId },
  );
  return Object.keys(configs ?? {});
}

/**
 * Heals legacy raw-keyed MCP tool names in an assistant payload to the
 * current normalized cache keys. Cached tool definitions are keyed
 * `${toolName}${mcp_delimiter}${normalizeServerName(server)}`, while an
 * assistant saved before that convention resubmits the raw-suffixed string
 * on every edit — the controllers' exact-only lookup would then silently
 * drop the tool from the assistant. SHADOWED raw names (normalized slot
 * claimed by another configured server) stay raw and fail closed, mirroring
 * the runtime heal, with the shadow set built from the FULL accessible
 * audit (cross-tier collisions included) and healing skipped outright when
 * that audit cannot complete. Config names are read only when a
 * delimiter-bearing name actually misses the cache; config-read failures
 * propagate (write path) rather than silently dropping the tool. Healed
 * string entries dedupe order-preserving so a payload carrying both
 * spellings can't submit duplicate function names.
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {Array<string | object>} [params.tools]
 * @param {Record<string, unknown>} params.toolDefinitions
 * @returns {Promise<Array<string | object>>}
 */
async function healMcpToolNames({ req, tools, toolDefinitions, accessibleServerNames }) {
  const list = tools ?? [];
  const needsHeal = list.some(
    (tool) =>
      typeof tool === 'string' &&
      tool.includes(Constants.mcp_delimiter) &&
      toolDefinitions[tool] == null,
  );
  if (!needsHeal) {
    return list;
  }
  /** Cross-tier shadowing (DB `foo` vs operator `foo!`) is invisible to
   *  operator names alone — the shadow set must come from the FULL
   *  accessible audit: assistants reference user-owned servers too (the
   *  definitions loader resolves them), so their pre-strip keys must heal
   *  against the same catalog. Callers holding the loader's snapshot pass
   *  it to avoid repeating the app-config and registry reads on the write
   *  path; without one, the audit is fetched here, and when it cannot
   *  complete healing is skipped entirely (the raw key stays raw and fails
   *  closed). */
  let auditNames = accessibleServerNames;
  if (auditNames == null) {
    const rawServerNames = await resolveMcpConfigNames(req);
    try {
      const accessible = await getAccessibleMcpServerNames(req.user?.id, req.user?.role);
      auditNames = [...new Set([...accessible, ...rawServerNames])];
    } catch (error) {
      logger.warn(
        '[healMcpToolNames] Accessible-server audit unavailable; skipping legacy-key healing:',
        error,
      );
      return list;
    }
  }
  const shadowed = findShadowedServerNames(auditNames);
  /** A pre-strip key persisted AFTER server-name normalization carries the
   *  NORMALIZED suffix, which the raw config names cannot match — the
   *  boundary must resolve against both spellings and map back to the raw
   *  name for the shadow and membership guards. */
  const serverNameAliases = buildServerNameAliases(auditNames);
  const boundaryNames = [...new Set([...auditNames, ...serverNameAliases.keys()])];
  const seen = new Set();
  const healedList = [];
  for (const tool of list) {
    let healedTool = tool;
    if (
      typeof tool === 'string' &&
      tool.includes(Constants.mcp_delimiter) &&
      toolDefinitions[tool] == null
    ) {
      const [, parsedServerName] = splitMCPToolKey(tool, boundaryNames);
      let rawServerName;
      if (parsedServerName != null && auditNames.includes(parsedServerName)) {
        rawServerName = parsedServerName;
      } else if (parsedServerName != null) {
        const aliased = serverNameAliases.get(parsedServerName);
        /** A normalized spelling on a CONTESTED slot is ambiguous between the
         *  tie-break winner and its shadowed rivals — rewriting persisted
         *  data must fail closed here, mirroring the raw-spelling shadow
         *  guard, rather than bind the reference to the winner. */
        const contested =
          aliased != null &&
          auditNames.some(
            (name) => name !== aliased && normalizeServerName(name) === parsedServerName,
          );
        rawServerName = contested ? undefined : aliased;
      }
      if (rawServerName != null && !shadowed.has(rawServerName)) {
        const healed = normalizeMCPToolKey(tool, auditNames);
        if (toolDefinitions[healed] != null) {
          healedTool = healed;
        } else {
          /** Catalog keys built after redundant-prefix stripping no longer
           *  match a pre-strip persisted key — without this second candidate
           *  the exact-lookup below silently drops the tool from the
           *  assistant. The rewrite only lands when the stripped key actually
           *  exists in the loaded definitions, so an unstripped catalog
           *  (collision guard kept the raw name) never heals into a phantom. */
          const keyServerName = normalizeServerName(rawServerName);
          const [healedToolName] = splitMCPToolKey(healed, [keyServerName]);
          const strippedName = stripServerNamePrefix(healedToolName, keyServerName);
          const strippedKey = `${strippedName}${Constants.mcp_delimiter}${keyServerName}`;
          /** Rewrite only when the stripped entry PROVES the same upstream
           *  identity — a stale key for a removed tool must not be healed
           *  onto a different sibling that kept its raw name. */
          if (
            strippedName !== healedToolName &&
            toolDefinitions[strippedKey]?.serverToolName === healedToolName
          ) {
            healedTool = strippedKey;
          }
        }
      }
    }
    /** A payload carrying both spellings collapses to one entry after the
     *  heal — duplicate function names make providers reject the save. */
    if (typeof healedTool === 'string') {
      if (seen.has(healedTool)) {
        continue;
      }
      seen.add(healedTool);
    }
    healedList.push(healedTool);
  }
  return healedList;
}

/**
 * Loads static and MCP function definitions used by assistant create/update writes. MCP catalogs
 * are stored per server and effective config, so assistant writers must resolve the referenced
 * server slices instead of relying on the static aggregate cache.
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} [params.res]
 * @param {Array<string | object>} [params.tools]
 * @returns {Promise<object>}
 */
async function getAssistantToolDefinitions({ req, res, tools }) {
  const registry = getMCPServersRegistry();
  const appConfig = await getAppConfigForRequest(req);
  const oboIdentityContext = createAuthIdentityContext({
    user: req.user,
    tenantId: getTenantId(),
  });
  const upstreamTokenProvider = createOpenIDSessionTokenProvider({
    req,
    res: res ?? req.res,
    user: req.user,
    identityContext: oboIdentityContext,
    tokenPreference: 'access_token',
  });
  return await loadAssistantToolDefinitions(
    {
      user: req.user,
      tools,
      staticTools: (await getCachedTools()) ?? {},
      mcpConfig: appConfig?.mcpConfig ?? {},
    },
    {
      ensureConfigServers: (mcpConfig) => registry.ensureConfigServers(mcpConfig),
      getAllServerConfigs: (userId, configServers, role) =>
        registry.getAllServerConfigs(userId, configServers, role),
      getMCPServerTools,
      getServerToolFunctionsSnapshot: async (userId, serverName, serverConfig, options) =>
        (await getMCPManager()?.getServerToolFunctionsSnapshot(
          userId,
          serverName,
          serverConfig,
          options,
        )) ?? {
          tools: null,
        },
      recoverServerTools: async (serverName, serverConfig) => {
        const userMCPAuthMap = await getUserMCPAuthMap({
          userId: req.user.id,
          servers: [serverName],
          findPluginAuthsByKeys,
        });
        const result = await reinitMCPServer({
          user: req.user,
          serverName,
          serverConfig,
          userMCPAuthMap,
          upstreamTokenProvider,
          oboIdentityContext,
          recoveryPolicy: appConfig?.mcpSettings?.catalogRecovery,
        });
        return result?.availableTools ?? null;
      },
      cacheMCPServerTools,
    },
  );
}

/**
 * Resolves the name set MCP collision guards audit against. Prefers the
 * caller-threaded accessible set; self-fetches only when a configured name
 * needs normalization (safe-name deployments never pay the lookup); reports
 * `complete: false` when the full set was needed but unavailable — callers
 * must then fail closed for normalization-sensitive references instead of
 * auditing against operator names alone.
 * @param {object} params
 * @param {readonly string[]} params.rawServerNames
 * @param {readonly string[]} [params.accessibleServerNames]
 * @param {string} [params.userId]
 * @param {string} [params.role]
 * @returns {Promise<{ names: readonly string[], complete: boolean }>}
 */
async function resolveCollisionAuditNames({ rawServerNames, accessibleServerNames, userId, role }) {
  if (accessibleServerNames?.length) {
    return { names: accessibleServerNames, complete: true };
  }
  const needsFullAudit = rawServerNames.some((name) => normalizeServerName(name) !== name);
  if (!needsFullAudit) {
    return { names: rawServerNames, complete: true };
  }
  try {
    const names = await getAccessibleMcpServerNames(userId, role);
    /** `resolveAllMcpConfigs` tolerates `ensureConfigServers` failures, so
     *  the merged read can silently omit config-only servers. The caller's
     *  raw config names come from the app-config snapshot (registry-
     *  independent), so the union keeps `complete: true` honest. */
    return { names: [...new Set([...names, ...rawServerNames])], complete: true };
  } catch (error) {
    logger.warn(
      '[MCP] Collision audit unavailable; normalization-sensitive references fail closed:',
      error,
    );
    return { names: rawServerNames, complete: false };
  }
}

/**
 * The MCP servers a user can reach, keyed by name, with the registry's tier
 * precedence already applied. This is the resolution behind `GET /api/mcp/servers`,
 * so anything derived from it agrees with the catalog the client was given.
 * @param {string} userId
 * @param {string} [role]
 * @returns {Promise<Record<string, import('@librechat/api').ParsedServerConfig>>}
 */
async function getAccessibleMCPServers(userId, role) {
  return await resolveAllMcpConfigs(userId, role != null ? { id: userId, role } : { id: userId });
}

async function resolveAllMcpConfigs(userId, user) {
  const registry = getMCPServersRegistry();
  const appConfig = await getAppConfigForUser(userId, user);
  let configServers = {};
  try {
    configServers = await registry.ensureConfigServers(appConfig?.mcpConfig || {});
  } catch {
    logger.warn('[resolveAllMcpConfigs] Config server resolution failed; continuing without');
  }
  if (user?.role) {
    return await registry.getAllServerConfigs(userId, configServers, user.role);
  }

  return await registry.getAllServerConfigs(userId, configServers);
}

/**
 * Best-effort early gate; the authoritative check is
 * `assertResolvedRuntimeConfigAllowed` in `@librechat/api`, whose *URL*
 * resolution this must mirror. It mirrors only that much: credential-bearing
 * fields are dropped here (`buildMCPDomainValidationConfig`) because this gate
 * runs before the connection path resolves them, so requiring them would reject
 * a server the authoritative check goes on to allow. Graph placeholders resolve
 * later (async), so a URL still carrying one defers to the authoritative check
 * instead of rejecting here.
 */
async function isEarlyDomainAllowed({
  serverConfig,
  user,
  requestBody,
  userMCPAuthMap,
  serverName,
  allowedDomains,
  allowedAddresses,
}) {
  const validationConfig = processMCPEnv({
    user,
    body: requestBody,
    dbSourced: isUserSourced(serverConfig),
    /** The decision reads the URL alone, and resolving a credential-bearing field it
     *  never reads would fail the gate on a stale request-time OpenID snapshot —
     *  before the connection path can refresh that bearer. */
    options: buildMCPDomainValidationConfig(serverConfig),
    customUserVars: getServerCustomUserVars(userMCPAuthMap, serverName),
  });
  if (
    typeof validationConfig?.url === 'string' &&
    containsGraphTokenPlaceholder(validationConfig.url)
  ) {
    return true;
  }
  return await isMCPDomainAllowed(validationConfig, allowedDomains, allowedAddresses);
}

/**
 * @param {string} toolName
 * @param {string} serverName
 */
function createUnavailableToolStub(toolName, serverName) {
  const normalizedToolKey = `${toolName}${Constants.mcp_delimiter}${normalizeServerName(serverName)}`;
  const _call = async () => [unavailableMsg, null];
  const toolInstance = tool(_call, {
    schema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input for the tool' },
      },
      required: [],
    },
    name: normalizedToolKey,
    description: unavailableMsg,
    responseFormat: AgentConstants.CONTENT_AND_ARTIFACT,
  });
  toolInstance.mcp = true;
  toolInstance.mcpRawServerName = serverName;
  return toolInstance;
}

function isEmptyObjectSchema(jsonSchema) {
  return (
    jsonSchema != null &&
    typeof jsonSchema === 'object' &&
    jsonSchema.type === 'object' &&
    (jsonSchema.properties == null || Object.keys(jsonSchema.properties).length === 0) &&
    !jsonSchema.additionalProperties
  );
}

/**
 * @param {object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {string} params.stepId - The ID of the step in the flow.
 * @param {ToolCallChunk} params.toolCall - The tool call object containing tool information.
 * @param {string | null} [params.streamId] - The stream ID for resumable mode.
 * @param {number} [params.jobCreatedAt] - The generation epoch that owns emitted events.
 */
function createRunStepDeltaEmitter({ res, stepId, toolCall, streamId = null, jobCreatedAt }) {
  /**
   * @param {string} authURL - The URL to redirect the user for OAuth authentication.
   * @param {{ expiresAt?: number }} [options]
   * @returns {Promise<void>}
   */
  return async function (authURL, options) {
    const eventData = buildMCPAuthRunStepDeltaEvent({ authURL, stepId, toolCall, options });
    if (streamId) {
      await GenerationJobManager.emitChunk(streamId, eventData, {
        expectedCreatedAt: jobCreatedAt,
      });
    } else {
      sendEvent(res, eventData);
    }
  };
}

/**
 * @param {object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {string} params.runId - The Run ID, i.e. message ID
 * @param {string} params.stepId - The ID of the step in the flow.
 * @param {ToolCallChunk} params.toolCall - The tool call object containing tool information.
 * @param {number} [params.index]
 * @param {string | null} [params.streamId] - The stream ID for resumable mode.
 * @param {number} [params.jobCreatedAt] - The generation epoch that owns emitted events.
 * @returns {() => Promise<void>}
 */
function createRunStepEmitter({
  res,
  runId,
  stepId,
  toolCall,
  index,
  streamId = null,
  jobCreatedAt,
}) {
  return async function () {
    const eventData = buildMCPAuthRunStepEvent({ runId, stepId, toolCall, index });
    if (streamId) {
      await GenerationJobManager.emitChunk(streamId, eventData, {
        expectedCreatedAt: jobCreatedAt,
      });
    } else {
      sendEvent(res, eventData);
    }
  };
}

/**
 * Creates a function used to ensure the flow handler is only invoked once
 * @param {object} params
 * @param {string} params.flowId - The ID of the login flow.
 * @param {FlowStateManager<any>} params.flowManager - The flow manager instance.
 * @param {(authURL: string, options?: { expiresAt?: number }) => void | Promise<void>} [params.callback]
 */
function createOAuthStart({ flowId, flowManager, callback }) {
  /**
   * Creates a function to handle OAuth login requests.
   * @param {string} authURL - The URL to redirect the user for OAuth authentication.
   * @param {{ expiresAt?: number }} [options]
   * @returns {Promise<boolean>} Returns true to indicate the event was sent successfully.
   */
  return async function (authURL, options) {
    let emitted = false;
    const emitOAuthStart = async (message) => {
      if (options) {
        await callback?.(authURL, options);
      } else {
        await callback?.(authURL);
      }
      emitted = true;
      logger.debug(message);
    };

    const existingFlow = await flowManager.getFlowState(flowId, 'oauth_login');
    if (existingFlow) {
      await emitOAuthStart('Re-sent OAuth login request to client');
      return true;
    }

    await flowManager.createFlowWithHandler(flowId, 'oauth_login', async () => {
      await emitOAuthStart('Sent OAuth login request to client');
      return true;
    });

    if (!emitted) {
      await emitOAuthStart('Re-sent OAuth login request to client');
    }

    return true;
  };
}

/**
 * @param {object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {string} params.stepId - The ID of the step in the flow.
 * @param {ToolCallChunk} params.toolCall - The tool call object containing tool information.
 * @param {string | null} [params.streamId] - The stream ID for resumable mode.
 * @param {number} [params.jobCreatedAt] - The generation epoch that owns emitted events.
 */
function createOAuthEnd({ res, stepId, toolCall, streamId = null, jobCreatedAt }) {
  return async function () {
    const eventData = buildMCPAuthRunStepEndDeltaEvent({ stepId, toolCall });
    if (streamId) {
      await GenerationJobManager.emitChunk(streamId, eventData, {
        expectedCreatedAt: jobCreatedAt,
      });
    } else {
      sendEvent(res, eventData);
    }
    logger.debug('Sent OAuth login success to client');
  };
}

/**
 * @param {Object} params
 * @param {() => Promise<void>} params.runStepEmitter
 * @param {(authURL: string, options?: { expiresAt?: number }) => Promise<void>} params.runStepDeltaEmitter
 * @returns {(authURL: string, options?: { expiresAt?: number }) => Promise<void>}
 */
function createOAuthCallback({ runStepEmitter, runStepDeltaEmitter }) {
  return async function (authURL, options) {
    await runStepEmitter();
    await runStepDeltaEmitter(authURL, options);
  };
}

function resolveToolCallUserId({ effectiveUser, capturedUser, invocationUserId, serverConfig }) {
  const identityBoundCredential =
    serverConfig?.obo != null || isDirectOpenIDBearerRecoveryEnabled(serverConfig ?? {});
  if (!identityBoundCredential) {
    return effectiveUser?.id || invocationUserId || capturedUser?.id;
  }

  const effectiveUserId = effectiveUser?.id;
  const capturedUserId = capturedUser?.id;
  const credentialLabel = serverConfig?.obo != null ? 'OBO' : 'Direct OpenID bearer';
  if (!effectiveUserId || !capturedUserId) {
    throw new Error(
      `${credentialLabel} tool calls require matching captured and effective user ids`,
    );
  }

  if (effectiveUserId !== capturedUserId) {
    throw new Error(`${credentialLabel} tool call user mismatch`);
  }

  return effectiveUserId;
}

/**
 * @param {Object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {import('@librechat/api').UpstreamTokenProvider} [params.upstreamTokenProvider] - Live upstream-token closure for OBO, built at the request boundary so this layer never receives the raw Express request.
 * @param {import('@librechat/api').UpstreamTokenProviderResolver} [params.upstreamTokenProviderResolver]
 * @param {import('@librechat/api').AuthIdentityContext} [params.oboIdentityContext] - Non-template-visible OBO identity context built from the real request user.
 * @param {IUser} params.user - The user from the request object.
 * @param {string} params.serverName
 * @param {AbortSignal} params.signal
 * @param {string} params.model
 * @param {number} [params.index]
 * @param {string | null} [params.streamId] - The stream ID for resumable mode.
 * @param {number} [params.jobCreatedAt] - The generation epoch that owns emitted events.
 * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap]
 * @param {import('@librechat/api').RequestScopedMCPConnectionStore} [params.requestScopedConnections]
 * @param {import('@librechat/api').ParsedServerConfig} [params.serverConfig] - Used to bypass reconnect throttling for request-scoped servers.
 * @returns { Promise<Array<typeof tool | { _call: (toolInput: Object | string) => unknown}>> } An object with `_call` method to execute the tool input.
 */
async function reconnectServer({
  res,
  user,
  index,
  signal,
  serverName,
  serverConfig,
  configServers,
  userMCPAuthMap,
  requestBody,
  requestScopedConnections,
  upstreamTokenProvider,
  upstreamTokenProviderResolver,
  oboIdentityContext,
  streamId = null,
  jobCreatedAt,
  recoveryPolicy,
}) {
  logger.debug('[MCP][reconnectServer] Starting reconnect', {
    userId: user?.id,
    hasUserMCPAuthMap: Boolean(userMCPAuthMap),
  });

  // Request-scoped servers reconnect on every message by design; throttling them
  // would stub out healthy tools for messages sent within the throttle window.
  const requestScoped = serverConfig ? requiresEphemeralUserConnection(serverConfig) : false;
  if (!requestScoped) {
    const throttleKey = `${user.id}:${serverName}`;
    const now = Date.now();
    const lastAttempt = lastReconnectAttempts.get(throttleKey) ?? 0;
    if (now - lastAttempt < RECONNECT_THROTTLE_MS) {
      logger.debug('[MCP][reconnectServer] Throttled reconnect');
      return null;
    }
    lastReconnectAttempts.set(throttleKey, now);
    evictStale(lastReconnectAttempts, RECONNECT_THROTTLE_MS);
  }

  const runId = Constants.USE_PRELIM_RESPONSE_MESSAGE_ID;
  const flowId = `${user.id}:${serverName}:${Date.now()}`;
  const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
  const stepId = buildMCPAuthStepId(serverName);
  const toolCall = buildMCPAuthToolCall({
    id: flowId,
    serverName,
  });

  const runStepEmitter = createRunStepEmitter({
    res,
    index,
    runId,
    stepId,
    toolCall,
    streamId,
    jobCreatedAt,
  });
  const runStepDeltaEmitter = createRunStepDeltaEmitter({
    res,
    stepId,
    toolCall,
    streamId,
    jobCreatedAt,
  });
  const callback = createOAuthCallback({ runStepEmitter, runStepDeltaEmitter });
  const oauthStart = createOAuthStart({
    res,
    flowId,
    callback,
    flowManager,
  });
  return await reinitMCPServer({
    user,
    signal,
    serverName,
    configServers,
    oauthStart,
    flowManager,
    userMCPAuthMap,
    requestBody,
    requestScopedConnections,
    upstreamTokenProvider,
    upstreamTokenProviderResolver,
    recoveryPolicy,
    oboIdentityContext,
    streamId,
    jobCreatedAt,
    forceNew: true,
    returnOnOAuth: false,
    connectionTimeout: Time.THIRTY_SECONDS,
  });
}

/**
 * Creates all tools from the specified MCP Server via `toolKey`.
 *
 * This function assumes tools could not be aggregated from the cache of tool definitions,
 * i.e. `availableTools`, and will reinitialize the MCP server to ensure all tools are generated.
 *
 * @param {Object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {{ canUseServers: (user?: IUser) => Promise<boolean> }} [params.mcpPermissionContext] - Request-scoped MCP permission context.
 * @param {IUser} params.user - The user from the request object.
 * @param {string} params.serverName
 * @param {string} params.model
 * @param {Providers | EModelEndpoint} params.provider - The provider for the tool.
 * @param {number} [params.index]
 * @param {AbortSignal} [params.signal]
 * @param {string | null} [params.streamId] - The stream ID for resumable mode.
 * @param {number} [params.jobCreatedAt] - The generation epoch that owns emitted events.
 * @param {import('@librechat/api').ParsedServerConfig} [params.config]
 * @param {import('@librechat/api').RequestBody} [params.requestBody]
 * @param {import('@librechat/api').RequestScopedMCPConnectionStore} [params.requestScopedConnections]
 * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap]
 * @param {import('@librechat/api').UpstreamTokenProvider} [params.upstreamTokenProvider] - Live upstream-token closure for OBO, built at the request boundary.
 * @param {import('@librechat/api').UpstreamTokenProviderResolver} [params.upstreamTokenProviderResolver]
 * @param {import('@librechat/api').AuthIdentityContext} [params.oboIdentityContext] - Non-template-visible OBO identity context built from the real request user.
 * @returns { Promise<Array<typeof tool | { _call: (toolInput: Object | string) => unknown}>> } An object with `_call` method to execute the tool input.
 */
async function createMCPTools({
  res,
  mcpPermissionContext,
  user,
  index,
  signal,
  config,
  provider,
  serverName,
  configServers,
  userMCPAuthMap,
  requestBody,
  requestScopedConnections,
  upstreamTokenProvider,
  upstreamTokenProviderResolver,
  oboIdentityContext,
  streamId = null,
  jobCreatedAt,
}) {
  let recoveryPolicy;
  const serverConfig =
    config ?? (await getMCPServersRegistry().getServerConfig(serverName, user?.id, configServers));

  if (serverConfig?.allowedEntraGroupIds?.length) {
    const filtered = await filterAppConfigMCPServers(
      { mcpConfig: { [serverName]: serverConfig } },
      user,
    );
    if (!filtered.mcpConfig[serverName]) {
      logger.warn(`[MCP] User is not authorized to access server '${serverName}'`);
      return [];
    }
  }

  if (serverConfig?.url) {
    const appConfig = await getAppConfig({
      role: user?.role,
      tenantId: user?.tenantId,
      userId: user?.id,
    });
    recoveryPolicy = appConfig?.mcpSettings?.catalogRecovery;
    const allowedDomains = appConfig?.mcpSettings?.allowedDomains;
    const allowedAddresses = appConfig?.mcpSettings?.allowedAddresses;
    const isDomainAllowed = await isEarlyDomainAllowed({
      serverConfig,
      user,
      requestBody,
      userMCPAuthMap,
      serverName,
      allowedDomains,
      allowedAddresses,
    });
    if (!isDomainAllowed) {
      logger.warn('[MCP] Domain not allowed; skipping all server tools');
      return [];
    }
  }

  const result = await reconnectServer({
    res,
    user,
    index,
    signal,
    serverName,
    serverConfig,
    configServers,
    userMCPAuthMap,
    requestBody,
    requestScopedConnections,
    upstreamTokenProvider,
    upstreamTokenProviderResolver,
    oboIdentityContext,
    streamId,
    jobCreatedAt,
    recoveryPolicy,
  });
  if (result === null) {
    logger.debug('[MCP] Reconnect throttled; skipping tool creation');
    return [];
  }
  if (!result || !result.tools) {
    logger.warn('[MCP] Failed to reinitialize server');
    return [];
  }

  const serverTools = [];
  const keyServerName = normalizeServerName(serverName);
  const keyToolNames = stripServerNamePrefixes(
    result.tools.map((tool) => tool.name),
    keyServerName,
  );
  for (const tool of result.tools) {
    const toolInstance = await createMCPTool({
      res,
      mcpPermissionContext,
      user,
      provider,
      userMCPAuthMap,
      configServers,
      streamId,
      jobCreatedAt,
      recoveryPolicy,
      availableTools: result.availableTools,
      serverName,
      /** Model-facing key: matches the normalized `availableTools` keys and
       *  the instance name `createToolInstance` will assign. */
      toolKey: `${keyToolNames.get(tool.name) ?? tool.name}${Constants.mcp_delimiter}${keyServerName}`,
      requestBody,
      requestScopedConnections,
      upstreamTokenProvider,
      upstreamTokenProviderResolver,
      oboIdentityContext,
      config: serverConfig,
    });
    if (toolInstance) {
      serverTools.push(toolInstance);
    }
  }

  return serverTools;
}

/**
 * Creates a single tool from the specified MCP Server via `toolKey`.
 * @param {Object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {{ canUseServers: (user?: IUser) => Promise<boolean> }} [params.mcpPermissionContext] - Request-scoped MCP permission context.
 * @param {IUser} params.user - The user from the request object.
 * @param {string} params.toolKey - The toolKey for the tool.
 * @param {string} params.model - The model for the tool.
 * @param {number} [params.index]
 * @param {AbortSignal} [params.signal]
 * @param {string | null} [params.streamId] - The stream ID for resumable mode.
 * @param {Providers | EModelEndpoint} params.provider - The provider for the tool.
 * @param {LCAvailableTools} [params.availableTools]
 * @param {import('@librechat/api').RequestBody} [params.requestBody]
 * @param {import('@librechat/api').RequestScopedMCPConnectionStore} [params.requestScopedConnections]
 * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap]
 * @param {import('@librechat/api').ParsedServerConfig} [params.config]
 * @param {import('@librechat/api').UpstreamTokenProvider} [params.upstreamTokenProvider] - Live upstream-token closure for OBO, built at the request boundary.
 * @param {import('@librechat/api').UpstreamTokenProviderResolver} [params.upstreamTokenProviderResolver]
 * @param {import('@librechat/api').AuthIdentityContext} [params.oboIdentityContext] - Non-template-visible OBO identity context built from the real request user.
 * @param {string} [params.serverName] - Resolved raw MCP server name from tool loading.
 * @param {(availableTools: LCAvailableTools) => void} [params.onAvailableTools]
 * @param {number} [params.jobCreatedAt] - The generation epoch that owns emitted events.
 * @returns { Promise<typeof tool | { _call: (toolInput: Object | string) => unknown}> } An object with `_call` method to execute the tool input.
 */
async function createMCPTool({
  res,
  mcpPermissionContext,
  user,
  index,
  signal,
  toolKey,
  provider,
  userMCPAuthMap,
  availableTools,
  requestBody,
  requestScopedConnections,
  config,
  configServers,
  upstreamTokenProvider,
  upstreamTokenProviderResolver,
  oboIdentityContext,
  serverName: resolvedServerName,
  onAvailableTools,
  streamId = null,
  jobCreatedAt,
  recoveryPolicy,
}) {
  /** `loadTools` already resolved the server for this key; parsing is the fallback. */
  const [parsedToolName, parsedServerName] = splitMCPToolKey(
    toolKey,
    /** Current keys embed the NORMALIZED server name, legacy persisted keys
     *  the RAW one — the candidate list needs both spellings or a raw name
     *  that contains the delimiter mis-splits under the generic fallback. */
    resolvedServerName
      ? [resolvedServerName, normalizeServerName(resolvedServerName)]
      : Object.keys(configServers ?? {}).flatMap((name) => [name, normalizeServerName(name)]),
  );
  let serverName = resolvedServerName ?? parsedServerName;
  const toolName = parsedToolName;

  let serverConfig =
    config ?? (await getMCPServersRegistry().getServerConfig(serverName, user?.id, configServers));
  /** DIRECT-FIRST alias fallback: only when the parsed name resolves to no
   *  server is it treated as the normalized spelling of a raw config name —
   *  a user-DB server named like an operator server's normalized form must
   *  keep its own identity. */
  if (!serverConfig && resolvedServerName == null && parsedServerName != null) {
    const aliasedName = buildServerNameAliases(Object.keys(configServers ?? {})).get(
      parsedServerName,
    );
    if (aliasedName != null && aliasedName !== parsedServerName) {
      serverConfig = await getMCPServersRegistry().getServerConfig(
        aliasedName,
        user?.id,
        configServers,
      );
      if (serverConfig) {
        serverName = aliasedName;
      }
    }
  }
  const requestScopedTools = serverConfig ? requiresEphemeralUserConnection(serverConfig) : false;
  const useMissingToolCache = !requestScopedTools;

  if (serverConfig?.url) {
    const appConfig = await getAppConfig({
      role: user?.role,
      tenantId: user?.tenantId,
      userId: user?.id,
    });
    recoveryPolicy ??= appConfig?.mcpSettings?.catalogRecovery;
    serverConfig = applyAttachmentUploadConfig(serverConfig, serverName, appConfig);
    const allowedDomains = appConfig?.mcpSettings?.allowedDomains;
    const allowedAddresses = appConfig?.mcpSettings?.allowedAddresses;
    const isDomainAllowed = await isEarlyDomainAllowed({
      serverConfig,
      user,
      requestBody,
      userMCPAuthMap,
      serverName,
      allowedDomains,
      allowedAddresses,
    });
    if (!isDomainAllowed) {
      logger.warn('[MCP] Domain no longer allowed; skipping tool creation');
      return undefined;
    }
  }

  /** Legacy keys persisted pre-normalization (assistants, direct tool
   *  calls) carry the RAW server name, while `availableTools` is keyed by
   *  the canonical normalized key — look up both spellings. Keys are also
   *  built after redundant server-name-prefix stripping now, so a persisted
   *  pre-strip key (`acme_foo_mcp_acme`) must additionally try
   *  its stripped spelling or the tool degrades to an unavailable stub. */
  const keyServerName = serverName != null ? normalizeServerName(serverName) : undefined;
  const canonicalToolKey =
    keyServerName != null ? `${toolName}${Constants.mcp_delimiter}${keyServerName}` : toolKey;
  const strippedToolName =
    keyServerName != null ? stripServerNamePrefix(toolName, keyServerName) : toolName;
  const strippedToolKey =
    strippedToolName !== toolName
      ? `${strippedToolName}${Constants.mcp_delimiter}${keyServerName}`
      : null;
  const candidateToolKeys = [toolKey];
  if (canonicalToolKey !== toolKey) {
    candidateToolKeys.push(canonicalToolKey);
  }
  if (strippedToolKey != null && !candidateToolKeys.includes(strippedToolKey)) {
    candidateToolKeys.push(strippedToolKey);
  }
  let matchedToolKey = toolKey;
  const findToolEntry = (tools) => {
    for (const key of candidateToolKeys) {
      const entry = tools?.[key];
      if (!entry?.function) {
        continue;
      }
      /** The stripped-spelling candidate is only a legacy match when the
       *  entry PROVES the same upstream identity — without this, a stale
       *  reference to a removed tool could strip onto a DIFFERENT sibling
       *  that kept its raw name and silently call the wrong tool. */
      if (key === strippedToolKey && entry.serverToolName !== toolName) {
        continue;
      }
      matchedToolKey = key;
      return entry;
    }
    return undefined;
  };

  /** @type {LCFunctionTool | undefined} */
  let toolEntry = findToolEntry(availableTools);
  if (!toolEntry) {
    const cachedAt = useMissingToolCache ? missingToolCache.get(toolKey) : undefined;
    if (cachedAt && Date.now() - cachedAt < MISSING_TOOL_TTL_MS) {
      logger.debug('[MCP] Tool is in negative cache; returning unavailable stub');
      return createUnavailableToolStub(toolName, serverName);
    }

    logger.warn('[MCP] Requested tool not found in available tools; reinitializing server');
    const result = await reconnectServer({
      res,
      user,
      index,
      signal,
      serverName,
      serverConfig,
      configServers,
      userMCPAuthMap,
      requestBody,
      requestScopedConnections,
      upstreamTokenProvider,
      upstreamTokenProviderResolver,
      oboIdentityContext,
      streamId,
      jobCreatedAt,
      ...(recoveryPolicy && { recoveryPolicy }),
    });
    if (result?.availableTools) {
      onAvailableTools?.(result.availableTools);
    }
    toolEntry = findToolEntry(result?.availableTools);

    if (!toolEntry && useMissingToolCache) {
      missingToolCache.set(toolKey, Date.now());
      evictStale(missingToolCache, MISSING_TOOL_TTL_MS);
    }
  }

  if (!toolEntry) {
    logger.warn(
      `[MCP][${serverName}][${toolName}] Tool definition not found, returning unavailable stub.`,
    );
    return createUnavailableToolStub(toolName, serverName);
  }

  return createToolInstance({
    res,
    mcpPermissionContext,
    user,
    requestBody,
    requestScopedConnections,
    provider,
    /** A legacy pre-strip key that resolves to the stripped entry KEEPS its
     *  persisted spelling as the instance name: `agent.tools` entries and
     *  `tool_options` keys reference that spelling, and renaming the instance
     *  would silently detach those per-tool settings. The upstream call name
     *  still comes from the MATCHED entry — its recorded raw name, or the
     *  matched key's own tool half when the entry was never stripped. */
    toolName,
    serverToolName:
      toolEntry.serverToolName ??
      (matchedToolKey === strippedToolKey ? strippedToolName : toolName),
    currentToolName: matchedToolKey === strippedToolKey ? strippedToolName : undefined,
    serverName,
    serverConfig,
    toolDefinition: toolEntry['function'],
    upstreamTokenProvider,
    upstreamTokenProviderResolver,
    oboIdentityContext,
    streamId,
    jobCreatedAt,
    recoveryPolicy,
  });
}

function createToolInstance({
  res,
  mcpPermissionContext,
  user: capturedUser = null,
  requestBody: capturedRequestBody,
  requestScopedConnections: capturedRequestScopedConnections,
  toolName,
  serverToolName = toolName,
  currentToolName,
  serverName,
  serverConfig: capturedServerConfig,
  toolDefinition,
  provider: capturedProvider,
  upstreamTokenProvider: capturedUpstreamTokenProvider = null,
  upstreamTokenProviderResolver: capturedUpstreamTokenProviderResolver = null,
  oboIdentityContext: capturedOboIdentityContext = null,
  streamId = null,
  jobCreatedAt,
  recoveryPolicy,
}) {
  /** @type {LCTool} */
  const { description, parameters, toolClass } = toolDefinition;
  const isGoogle = capturedProvider === Providers.VERTEXAI || capturedProvider === Providers.GOOGLE;

  let schema = parameters ? normalizeJsonSchema(resolveJsonSchemaRefs(parameters)) : null;

  if (schema && isGoogle) {
    // Gemini/Vertex AI accept only a subset of JSON Schema; sanitize so MCP tools with
    // unions, non-string enums, etc. don't 400 (they work as-is on OpenAI/Claude).
    schema = sanitizeGeminiSchema(schema);
  }

  if (!schema || (isGoogle && isEmptyObjectSchema(schema))) {
    schema = {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input for the tool' },
      },
      required: [],
    };
  }

  // Deloitte Custom Change: expose current attachment IDs only to configured trusted upload tools.
  schema = addAttachmentUploadHints(
    schema,
    toolName,
    capturedServerConfig,
    capturedRequestBody,
    isGoogle,
  );
  const attachmentUpload = supportsAttachmentUpload(capturedServerConfig, toolName);
  const attachmentSourceField = isGoogle
    ? 'sourceFile'
    : getAttachmentSourceField(capturedRequestBody);
  const attachmentInstructions = `Upload a file already available in this conversation. Provide the destination fields and ${attachmentSourceField}. Never provide content, file bytes, or encoding: LibreChat reads and encodes the file after this tool call.`;
  const attachmentUploadDescription = attachmentUpload
    ? [description, attachmentInstructions].filter(Boolean).join('\n\n')
    : description || '';

  const normalizedToolKey = `${toolName}${Constants.mcp_delimiter}${normalizeServerName(serverName)}`;
  // Deloitte Custom Change: only the operator-configured SharePoint gateway can create download artifacts.
  const trustedSharePointServerName =
    process.env.SHAREPOINT_MCP_SERVER_NAME || 'cleartrack-mcp-gateway-sharepoint';
  const trustedSharePointDownloadToolName =
    process.env.SHAREPOINT_MCP_DOWNLOAD_TOOL || 'sp_download_file';
  // Only the operator-configured gateway may return a Code Interpreter download artifact.
  const isTrustedSharePointAttachmentTool =
    toolName === trustedSharePointDownloadToolName &&
    serverName === trustedSharePointServerName &&
    capturedServerConfig != null &&
    !isUserSourced(capturedServerConfig);

  /** @type {(toolArguments: Object | string, config?: GraphRunnableConfig) => Promise<unknown>} */
  const _call = async (toolArguments, config) => {
    const effectiveUser = config?.configurable?.user ?? capturedUser;
    const permissionUser = effectiveUser;
    /** @type {string | undefined} */
    let userId;

    try {
      userId = resolveToolCallUserId({
        effectiveUser,
        capturedUser,
        invocationUserId: config?.configurable?.user_id,
        serverConfig: capturedServerConfig,
      });
      const provider = (config?.metadata?.provider || capturedProvider)?.toLowerCase();
      const canUseMCP = mcpPermissionContext
        ? await mcpPermissionContext.canUseServers(permissionUser)
        : await userCanUseMCPServers(permissionUser);
      if (!canUseMCP) {
        throw new Error('Forbidden: Insufficient MCP server permissions');
      }
      const flowsCache = getLogStores(CacheKeys.FLOWS);
      const flowManager = getFlowStateManager(flowsCache);
      const derivedSignal = config?.signal ? AbortSignal.any([config.signal]) : undefined;
      const mcpManager = getMCPManager(userId);

      const { args: _args, stepId, ...toolCall } = config.toolCall ?? {};
      const flowId = `${serverName}:oauth_login:${config.metadata.thread_id}:${config.metadata.run_id}`;
      const runStepDeltaEmitter = createRunStepDeltaEmitter({
        res,
        stepId,
        toolCall,
        streamId,
        jobCreatedAt,
      });
      const oauthStart = createOAuthStart({
        flowId,
        flowManager,
        callback: runStepDeltaEmitter,
      });
      const oauthEnd = createOAuthEnd({
        res,
        stepId,
        toolCall,
        streamId,
        jobCreatedAt,
      });

      const customUserVars =
        config?.configurable?.userMCPAuthMap?.[`${Constants.mcp_prefix}${serverName}`];
      /**
       * The upstream-token closure is built at the request boundary (where
       * `req`/`res` are in scope) and captured here, so this layer never holds
       * the raw Express request. The closure reads/refreshes the LIVE
       * `req.session.openidTokens` at call time and persists rotations; it is a
       * no-op when reuse is off or the user is non-OpenID. A browser request whose session loses
       * openidTokens rejects instead of falling back to a stale strategy snapshot.
       * `tokenPreference: 'access_token'` (set at construction)
       * is required for OBO since the grant sends the access token to the IdP
       * as the jwt-bearer assertion.
       */
      // Deloitte Custom Change: substitute the original authorized attachment immediately before dispatch.
      const effectiveRequestBody = config?.configurable?.requestBody
        ? { ...capturedRequestBody, ...config.configurable.requestBody }
        : capturedRequestBody;
      const resolvedToolArguments = supportsAttachmentUpload(capturedServerConfig, toolName)
        ? await resolveAttachmentUpload({
            toolArguments,
            requestBody: effectiveRequestBody,
            req: res?.req,
            res,
            user: effectiveUser,
            signal: derivedSignal,
          })
        : toolArguments;

      const callToolOptions = {
        serverName,
        serverConfig: capturedServerConfig,
        /** The upstream server never sees stripped names — a key that dropped
         *  a redundant server-name prefix calls the ORIGINAL tool. */
        toolName: serverToolName,
        provider,
        toolArguments: resolvedToolArguments,
        options: {
          signal: derivedSignal,
        },
        user: effectiveUser,
        requestBody: effectiveRequestBody,
        requestScopedConnections:
          config?.configurable?.requestScopedConnections ?? capturedRequestScopedConnections,
        customUserVars,
        flowManager,
        tokenMethods: {
          findToken,
          createToken,
          updateToken,
          deleteTokens,
        },
        onOAuthCredentialsChanging: (scope) =>
          prepareMCPAuthorizationMutation(scope, {
            invalidateRecoveryGeneration: invalidateCachedTools,
            persistPublicationRetry: persistMCPAuthorizationFenceRetry,
            clearPublicationRetry: clearMCPAuthorizationFenceRetry,
            clearLocalRecovery: (userId, changedServerName) =>
              mcpManager.clearCatalogRecoveryState?.(userId, changedServerName),
            retryDelaysMs: recoveryPolicy?.authorizationFenceRetryMs,
            attemptTimeoutMs: recoveryPolicy?.authorizationFenceTimeoutMs,
          }),
        oauthStart,
        oauthEnd,
        graphTokenResolver: getGraphApiToken,
        oboTokenResolver: exchangeOboToken,
        oboTrustChecker: createOboTrustChecker(),
        // Deloitte Custom Change: extract every trusted gateway response so its
        // short-lived URL never reaches model context, even when this caller
        // cannot use Code Interpreter.
        extractSharePointAttachment: isTrustedSharePointAttachmentTool,
        upstreamTokenProvider: capturedUpstreamTokenProvider,
        upstreamTokenProviderResolver: capturedUpstreamTokenProviderResolver,
        oboIdentityContext: capturedOboIdentityContext,
      };
      const result = await mcpManager.callTool(callToolOptions);

      const artifacts = Array.isArray(result) ? result[1] : undefined;
      /* The Assistants endpoint (and any other non-agent caller returning
       * only `result[0]` below) has no code-session pipeline to hand this
       * artifact to; registering it there would upload the file to Code
       * Interpreter storage for no consumer. `formatToolContent` still empties
       * `result[0]` for a marker-only response regardless of provider, so
       * without a substitute the Assistants endpoint would return nothing at
       * all for a tool call that otherwise succeeded. */
      // Deloitte Custom Change: register MCP download resources with Code Interpreter.
      if (artifacts?.codeFile && isAssistantsEndpoint(provider)) {
        if (Array.isArray(result) && !result[0]) {
          const sanitizedFilename = sanitizeFilename(artifacts.codeFile.name);
          const failureReason = getUploadTimeoutMessage(getCodeFileTypeLabel(sanitizedFilename));
          result[0] = `File "${sanitizedFilename}" could not be attached to this conversation for use in Code Interpreter. ${failureReason}`;
        }
      } else if (artifacts?.codeFile) {
        const { name, url, mimeType, gatewayDownload, size, expiresAt } = artifacts.codeFile;
        // Deloitte Custom Change: gateway filenames are untrusted and must never reach model context or logs unsanitized.
        const sanitizedFilename = sanitizeFilename(name);
        const attachmentRetryMessage = getUploadTimeoutMessage(
          getCodeFileTypeLabel(sanitizedFilename),
        );
        delete artifacts?.codeFile;
        const req = res?.req;
        /* `checkCapability` hits the DB/role-permissions layer, so a transient
         * failure there must not turn an already-successful tool call (e.g.
         * the SharePoint download) into a hard error via the outer catch —
         * fail closed the same way an explicit "not enabled" result does. */
        let capabilityCheckFailed = false;
        let hasExecuteCodeCapability = false;
        /* `formatToolContent` returns an empty `result[0]` for a marker-only
         * download response, deferring all user-visible content to the
         * codeFile artifact. If that artifact is then dropped below without
         * a substitute message, the model sees a completely empty tool
         * result with no indication the download happened (or failed). */
        let codeFileRegistrationFailed = false;
        let codeFileFailureReason;
        if (req) {
          try {
            hasExecuteCodeCapability = await checkCapability(req, AgentCapabilities.execute_code);
          } catch (capabilityError) {
            capabilityCheckFailed = true;
            logger.warn(
              `[MCP][${serverName}][${toolName}][User: ${userId}] Dropped codeFile artifact "${sanitizedFilename}": failed to check Code Interpreter capability.`,
              { message: capabilityError?.message, stack: capabilityError?.stack },
            );
          }
        }
        if (!req) {
          codeFileRegistrationFailed = true;
          codeFileFailureReason = attachmentRetryMessage;
          logger.warn(
            `[MCP][${serverName}][${toolName}][User: ${userId}] Dropped codeFile artifact "${sanitizedFilename}": no request context available to register it with Code Interpreter.`,
          );
        } else if (capabilityCheckFailed) {
          codeFileRegistrationFailed = true;
          codeFileFailureReason = attachmentRetryMessage;
          // Already logged above.
        } else if (!hasExecuteCodeCapability) {
          codeFileRegistrationFailed = true;
          codeFileFailureReason = attachmentRetryMessage;
          logger.warn(
            `[MCP][${serverName}][${toolName}][User: ${userId}] Dropped codeFile artifact "${sanitizedFilename}": Code Interpreter is not enabled for this endpoint.`,
          );
        } else if (config?.configurable?.codeEnvAvailable !== true) {
          /* `checkCapability` above is only the endpoint-level admin gate; the
           * agent actually handling this call may not have `execute_code` in
           * its own tool list (`effectiveCodeEnvAvailable` in initialize.ts),
           * in which case it has no Code Interpreter session to use this file
           * from. */
          codeFileRegistrationFailed = true;
          codeFileFailureReason = attachmentRetryMessage;
          logger.warn(
            `[MCP][${serverName}][${toolName}][User: ${userId}] Dropped codeFile artifact "${sanitizedFilename}": this agent does not have Code Interpreter (execute_code) available.`,
          );
        } else {
          let stream;
          try {
            if (gatewayDownload) {
              validateGatewayCodeFile({ req, mimeType, size });
            }
            const appConfig = await getAppConfig({
              role: effectiveUser?.role,
              tenantId: effectiveUser?.tenantId ?? getTenantId(),
              userId,
            });
            const codeFileAllowedDomains = appConfig?.mcpSettings?.codeFileAllowedDomains;
            const download = await fetchAllowedCodeFileStream(
              url,
              codeFileAllowedDomains,
              appConfig?.mcpSettings?.allowedAddresses,
              // Deloitte Custom Change: only trusted gateway artifacts use the strict grant metadata limiter.
              gatewayDownload ? { size, expiresAt } : undefined,
            );
            stream = download.data;
            const responseMimeType = String(download.headers?.['content-type'] ?? '')
              .split(';', 1)[0]
              .trim()
              .toLowerCase();
            if (
              gatewayDownload &&
              responseMimeType &&
              responseMimeType !== mimeType?.toLowerCase()
            ) {
              throw new Error(
                'codeFile download content type does not match the gateway declaration',
              );
            }
            const uploaded = await uploadCodeEnvFile({
              req,
              stream,
              filename: sanitizedFilename,
              kind: 'user',
              id: userId,
            });
            artifacts[HOST_FILE_AUTHORING_ARTIFACT_KEY] = true;
            artifacts.session_id = uploaded.storage_session_id;
            artifacts.files = [
              {
                id: uploaded.file_id,
                name: sanitizedFilename,
                storage_session_id: uploaded.storage_session_id,
                resource_id: userId,
                kind: 'user',
              },
            ];
            if (Array.isArray(result)) {
              const attachmentStatus = `File "${sanitizedFilename}" is attached to Code Interpreter. Use execute_code to inspect the attached file; do not download it from a URL.`;
              result[0] = result[0] ? `${result[0]}\n${attachmentStatus}` : attachmentStatus;
            }
          } catch (codeFileError) {
            /** Keep the underlying tool result (e.g. the SharePoint download
             *  already succeeded) instead of failing the whole call over a
             *  transient network blip, a disallowed/redirected URL, or an
             *  expired short-lived download URL. */
            codeFileRegistrationFailed = true;
            // Deloitte Custom Change: retain a safe reason for marker-only MCP responses.
            codeFileFailureReason = getCodeFileAttachmentFailureReason(
              codeFileError,
              sanitizedFilename,
            );
            logger.warn(
              `[MCP][${serverName}][${toolName}][User: ${userId}] Failed to register codeFile artifact "${sanitizedFilename}" with Code Interpreter:`,
              /** Axios attaches the raw (signed) request URL to `error.config`/
               *  `error.request`; logging `codeFileError` directly would leak
               *  that credential-bearing query string, so only the message
               *  and stack (already redacted at the throw site above) are
               *  logged here. */
              { message: codeFileError?.message, stack: codeFileError?.stack },
            );
          } finally {
            /* If `uploadCodeEnvFile` threw/rejected before fully consuming
             * `stream` (e.g. it validates the filename before reading the
             * body), the underlying socket is left open — Node does not
             * clean this up on its own. `destroy()` on an already-consumed
             * or already-destroyed stream is a safe no-op. */
            if (typeof stream?.destroy === 'function' && !stream.destroyed) {
              stream.destroy();
            }
          }
        }
        /* Preserve the tool result while always making failed attachment
         * registration visible to the model. This can happen after a successful
         * download, so the status wording stays neutral about download success. */
        if (codeFileRegistrationFailed && Array.isArray(result)) {
          // Deloitte Custom Change: preserve the agent signal when attachment registration fails.
          const failureReason = codeFileFailureReason ? ` ${codeFileFailureReason}` : '';
          const attachmentStatus = `File "${sanitizedFilename}" could not be attached to this conversation for use in Code Interpreter.${failureReason}`;
          result[0] = result[0] ? `${result[0]}\n${attachmentStatus}` : attachmentStatus;
        }
      }

      if (isAssistantsEndpoint(provider) && Array.isArray(result)) {
        return result[0];
      }
      return result;
    } catch (error) {
      /** A user Stop aborts every in-flight call at once, and that rejection is
       *  the cancellation working, so it must not reach error-level operational
       *  alerts; the wrapping below still reports it to the turn. The error has
       *  to look like an abort as well: a permission, OAuth, or upstream failure
       *  can reject in the same tick as the Stop and must stay visible. */
      if (
        config?.signal?.aborted === true &&
        (isAbortError(error) || error === config.signal.reason)
      ) {
        logger.debug(
          `[MCP][${serverName}][${toolName}][User: ${userId}] Tool call cancelled by user abort`,
        );
        throw error;
      } else {
        logger.error(
          `[MCP][${serverName}][${toolName}][User: ${userId}] Error calling MCP tool:`,
          error,
        );
      }

      // The schedule service checks the typed cause and verified job identity before
      // recording a durable tool failure; other tool errors are a cheap no-op.
      await require('~/server/services/Schedules').recordMCPToolAuthFailure({
        error,
        streamId,
        jobCreatedAt,
        userId,
        serverName,
      });

      /** Carries the actionable re-auth message; the substring heuristic below would misreport it as an OAuth configuration problem */
      if (
        error instanceof OpenIDReauthRequiredError ||
        error instanceof MCPAuthenticationRefreshError ||
        error instanceof MCPAuthenticationRejectedError
      ) {
        throw error;
      }

      /** OAuth error, provide a helpful message */
      const isOAuthError =
        error.message?.includes('401') ||
        error.message?.includes('OAuth') ||
        error.message?.includes('authentication') ||
        error.message?.includes('Non-200 status code (401)');
      const isOAuthFlowSignal =
        error.message === 'OAuth flow initiated - return early' ||
        error.message === 'Pending OAuth flow reused - return early';

      if (isOAuthError) {
        if (
          capturedServerConfig &&
          !requiresOAuthMachinery(capturedServerConfig) &&
          !isOAuthFlowSignal
        ) {
          throw new Error(
            `[MCP][${serverName}][${toolName}] upstream authentication failed; MCP OAuth is not configured for this server.`,
          );
        }
        throw new Error(
          `[MCP][${serverName}][${toolName}] OAuth authentication required. Please check the server logs for the authentication URL.`,
        );
      }

      throw new Error(
        `[MCP][${serverName}][${toolName}] tool call failed${error?.message ? `: ${error?.message}` : '.'}`,
      );
    }
  };

  const toolInstance = tool(_call, {
    schema,
    name: normalizedToolKey,
    description: attachmentUploadDescription,
    responseFormat: AgentConstants.CONTENT_AND_ARTIFACT,
  });
  toolInstance.mcp = true;
  toolInstance.mcpRawServerName = serverName;
  // Deloitte Custom Change: retain the gateway class on the running instance so the
  // approval pipeline can describe the call without re-resolving the server.
  toolInstance.mcpToolClass = toolClass;
  if (serverToolName !== toolName) {
    /** Upstream identity for stripped keys — lets the options aliasing in
     *  `buildToolClassification` heal legacy `tool_options` spellings. */
    toolInstance.mcpServerToolName = serverToolName;
  }
  if (currentToolName != null && currentToolName !== toolName) {
    /** Current catalog spelling for a LEGACY-named instance, so approval
     *  policies and hook matchers written against the current name still
     *  reach it (see `collectMCPToolAliases`). */
    toolInstance.mcpCurrentToolName = currentToolName;
  }
  // Ephemeral request-scoped servers (runtime body placeholders) tear their
  // connection down at request end, so they must never be backgrounded. A
  // missing/stale config means the server's lifetime is unknowable, so fail
  // closed (foreground) rather than risk a detached call against a torn-down
  // connection.
  toolInstance.mcpRequiresEphemeralConnection = capturedServerConfig
    ? requiresEphemeralUserConnection(capturedServerConfig)
    : true;
  // Deloitte Custom Change: expose the rewritten attachment-reference schema to every provider.
  // This must match the runtime validator or models will continue to emit the original `content` field.
  toolInstance.mcpJsonSchema = schema;
  return toolInstance;
}

/**
 * Get MCP setup data including config, connections, and OAuth servers.
 * Resolves config-source servers from admin Config overrides when tenant context is available.
 * @param {string} userId - The user ID
 * @param {{ role?: string, tenantId?: string, appConfig?: object }} [options] - Optional request context
 * @returns {Object} Object containing mcpConfig, appConnections, userConnections, and oauthServers
 */
async function getMCPSetupData(userId, options = {}) {
  const registry = getMCPServersRegistry();
  const { role, tenantId } = options;

  const rawAppConfig = options.appConfig ?? (await getAppConfig({ role, tenantId, userId }));
  const appConfig = await filterAppConfigMCPServers(rawAppConfig, options.user ?? { id: userId });
  const configServers = await registry.ensureConfigServers(appConfig?.mcpConfig || {});
  const mcpConfig = role
    ? await registry.getAllServerConfigs(userId, configServers, role)
    : await registry.getAllServerConfigs(userId, configServers);
  const mcpManager = getMCPManager(userId);
  /** @type {Map<string, import('@librechat/api').MCPConnection>} */
  let appConnections = new Map();
  try {
    // Use getLoaded() instead of getAll() to avoid forcing connection creation.
    // getAll() creates connections for all servers, which is problematic for servers
    // that require user context (e.g., those with {{LIBRECHAT_USER_ID}} placeholders).
    appConnections = (await mcpManager.appConnections?.getLoaded()) || new Map();
  } catch (error) {
    logger.error(`[MCP][User: ${userId}] Error getting app connections:`, error);
  }
  const userConnections = mcpManager.getUserConnections(userId) || new Map();
  const oauthServers = new Set(
    Object.entries(mcpConfig)
      .filter(([, config]) => isOAuthServer(config))
      .map(([name]) => name),
  );

  return {
    mcpConfig,
    oauthServers,
    appConnections,
    userConnections,
  };
}

/**
 * Check OAuth flow status for a user and server
 * @param {string} userId - The user ID
 * @param {string} serverName - The server name
 * @param {string} [tenantId] - The tenant ID for the current request.
 * @returns {Object} Object containing active and failed flow flags
 */
async function checkOAuthFlowStatus(userId, serverName, tenantId = getTenantId()) {
  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = getFlowStateManager(flowsCache);
  const flowId = getOAuthFlowId(userId, serverName, tenantId);

  try {
    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (!flowState) {
      return { hasActiveFlow: false, hasFailedFlow: false };
    }

    const flowAge = Date.now() - flowState.createdAt;
    // Report active only while the flow is still usable (the handling/reuse window),
    // not for the full Keyv retention TTL — otherwise the UI shows "connecting" for a
    // flow the initiate/callback paths already reject, hiding the connect button.
    const flowTTL = flowState.ttl || PENDING_STALE_MS;

    if (flowState.status === 'FAILED' || (flowState.status === 'PENDING' && flowAge > flowTTL)) {
      const wasCancelled = /abort|cancel/i.test(flowState.error ?? '');

      if (wasCancelled) {
        logger.debug(`[MCP Connection Status] Found cancelled OAuth flow for ${serverName}`, {
          flowId,
          status: flowState.status,
          error: flowState.error,
        });
        return { hasActiveFlow: false, hasFailedFlow: false };
      } else {
        logger.debug(`[MCP Connection Status] Found failed OAuth flow for ${serverName}`, {
          flowId,
          status: flowState.status,
          flowAge,
          flowTTL,
          timedOut: flowAge > flowTTL,
          error: flowState.error,
        });
        return { hasActiveFlow: false, hasFailedFlow: true };
      }
    }

    if (flowState.status === 'PENDING') {
      logger.debug(`[MCP Connection Status] Found active OAuth flow for ${serverName}`, {
        flowId,
        flowAge,
        flowTTL,
      });
      return { hasActiveFlow: true, hasFailedFlow: false };
    }

    return { hasActiveFlow: false, hasFailedFlow: false };
  } catch (error) {
    logger.error(`[MCP Connection Status] Error checking OAuth flows for ${serverName}:`, error);
    return { hasActiveFlow: false, hasFailedFlow: false };
  }
}

async function hasDurableMCPAuthorization(userId, serverName, config, runtimeContext = {}) {
  const userMCPAuthMap =
    runtimeContext.userMCPAuthMap ?? (await runtimeContext.loadUserMCPAuthMap?.());
  const customUserVars = getServerCustomUserVars(userMCPAuthMap, serverName);
  if (getMissingCustomUserVars(config, customUserVars).length > 0) {
    return false;
  }

  const dbSourced = isUserSourced(config);
  const bindingConfig = {
    ...config,
    args: undefined,
    env: undefined,
    headers: undefined,
    oauth_headers: undefined,
  };
  const graphProcessedConfig = dbSourced
    ? bindingConfig
    : await preProcessGraphTokens(bindingConfig, {
        user: runtimeContext.user,
        graphTokenResolver: getGraphApiToken,
        scopes: process.env.GRAPH_API_SCOPES,
      });
  const runtimeConfig = processMCPEnv({
    user: runtimeContext.user,
    options: graphProcessedConfig,
    dbSourced,
    customUserVars,
  });
  const allowlists = await (runtimeContext.loadMCPAllowlists?.() ??
    getMCPServersRegistry().resolveAllowlists({
      userId,
      role: runtimeContext.user?.role,
    }));
  if (
    runtimeConfig.url &&
    !(await isMCPDomainAllowed(
      runtimeConfig,
      allowlists.allowedDomains,
      allowlists.allowedAddresses,
    ))
  ) {
    return false;
  }
  return MCPTokenStorage.hasStoredAuthorization({
    userId,
    serverName,
    findToken,
    validateClientBinding: (clientInfo, storedMetadata) =>
      MCPOAuthHandler.assertStoredClientBinding(
        serverName,
        runtimeConfig.url,
        clientInfo,
        storedMetadata,
        runtimeConfig.oauth,
      ),
  });
}

async function getMCPUserConfigurationState(serverName, config, runtimeContext = {}) {
  if (!hasCustomUserVars(config)) {
    return undefined;
  }

  const userMCPAuthMap =
    runtimeContext.userMCPAuthMap ?? (await runtimeContext.loadUserMCPAuthMap?.());
  const customUserVars = getServerCustomUserVars(userMCPAuthMap, serverName);
  return getMissingCustomUserVars(config, customUserVars).length > 0
    ? 'needs_configuration'
    : 'configured';
}

function canDetectMCPRuntimeOAuth(config) {
  return config.requiresOAuth == null && config.apiKey == null && hasRuntimeUrlPlaceholders(config);
}

/**
 * Get connection status for a specific MCP server
 * @param {string} userId - The user ID
 * @param {string} serverName - The server name
 * @param {import('@librechat/api').ParsedServerConfig} config - The server configuration
 * @param {Map<string, import('@librechat/api').MCPConnection>} appConnections - App-level connections
 * @param {Map<string, import('@librechat/api').MCPConnection>} userConnections - User-level connections
 * @param {Set} oauthServers - Set of OAuth servers
 * @param {{ user?: Partial<IUser>, userMCPAuthMap?: Record<string, Record<string, string>>, loadUserMCPAuthMap?: () => Promise<Record<string, Record<string, string>> | undefined>, loadMCPAllowlists?: () => Promise<{ allowedDomains?: string[] | null, allowedAddresses?: string[] | null }> }} [runtimeContext]
 * @returns {Object} Object containing requiresOAuth, requestScoped, connectionState,
 *   authorizationState, and configuredObo
 */
async function getServerConnectionStatus(
  userId,
  serverName,
  config,
  appConnections,
  userConnections,
  oauthServers,
  runtimeContext = {},
) {
  const connection = appConnections.get(serverName) || userConnections.get(serverName);
  const isStaleOrDoNotExist = connection ? connection?.isStale(config.updatedAt) : true;
  const configuredOAuth = oauthServers.has(serverName);
  const liveConnectionOAuth = connection?.usesOAuth?.() === true;
  const runtimeOAuthCandidate = canDetectMCPRuntimeOAuth(config);
  const isOboConfig = isOboServer(config);
  const effectiveOAuth = configuredOAuth || liveConnectionOAuth;
  const requestScoped = requiresEphemeralUserConnection(config);
  const configurationState = requestScoped
    ? await getMCPUserConfigurationState(serverName, config, runtimeContext)
    : undefined;

  const baseConnectionState = isStaleOrDoNotExist
    ? 'disconnected'
    : connection?.connectionState || 'disconnected';
  let finalConnectionState = baseConnectionState;
  let requiresOAuth = effectiveOAuth;
  let authorizationState = effectiveOAuth ? 'needs_authorization' : 'not_required';

  // connection state overrides specific to OAuth servers
  if (effectiveOAuth && baseConnectionState === 'connected') {
    authorizationState = 'authorized';
  } else if (effectiveOAuth && baseConnectionState === 'connecting') {
    authorizationState = 'authorizing';
  } else if (effectiveOAuth && baseConnectionState === 'error') {
    authorizationState = 'error';
  } else if (baseConnectionState === 'disconnected' && (effectiveOAuth || runtimeOAuthCandidate)) {
    // check if server is actively being reconnected
    const oauthReconnectionManager = getOAuthReconnectionManager();
    if (oauthReconnectionManager.isReconnecting(userId, serverName)) {
      requiresOAuth = true;
      finalConnectionState = 'connecting';
      authorizationState = 'authorizing';
    } else {
      const { hasActiveFlow, hasFailedFlow } = await checkOAuthFlowStatus(userId, serverName);

      if (hasFailedFlow) {
        requiresOAuth = true;
        finalConnectionState = 'error';
        authorizationState = 'error';
      } else if (hasActiveFlow) {
        requiresOAuth = true;
        finalConnectionState = 'connecting';
        authorizationState = 'authorizing';
      } else if (await hasDurableMCPAuthorization(userId, serverName, config, runtimeContext)) {
        /** OAuth readiness is durable even when this pod has no live connection. */
        requiresOAuth = true;
        finalConnectionState = 'connected';
        authorizationState = 'authorized';
      } else if (isOboConfig && runtimeContext?.user?.openidId) {
        // OBO servers extract tokens from federatedTokens (preserved in safe user object)
        const tokenInfo = extractOpenIDTokenInfo(runtimeContext.user);

        if (tokenInfo && isOpenIDTokenValid(tokenInfo)) {
          /**
           * OBO servers use ephemeral in-memory cached tokens (not persistent DB storage).
           * User's upstream OpenID token is sufficient to display 'connected' status.
           *
           * Trustedness validation occurs later via oboTrustChecker during actual token exchange.
           * Token expiration/validity is checked during on-demand OBO token resolution at tool execution.
           * This allows green icon display on sign-in when upstream token is fresh.
           */
          requiresOAuth = true;
          finalConnectionState = 'connected';
          authorizationState = 'authorized';
        }
      }
    }
  }

  return {
    requiresOAuth,
    ...(requestScoped && { requestScoped: true }),
    ...(configurationState && { configurationState }),
    connectionState: finalConnectionState,
    authorizationState,
    configuredObo: isOboConfig,
  };
}

module.exports = {
  createMCPTool,
  createMCPTools,
  toProviderToolDefinition,
  createMCPPermissionContext,
  userCanUseMCPServers,
  getMCPSetupData,
  resolveConfigServers,
  resolveMcpServerNames,
  resolveMcpServerContext,
  getAccessibleMcpServerNames,
  healMcpToolNames,
  getAssistantToolDefinitions,
  resolveCollisionAuditNames,
  resolveMcpConfigNames,
  resolveAllMcpConfigs,
  getAccessibleMCPServers,
  createOAuthStart,
  checkOAuthFlowStatus,
  getServerConnectionStatus,
  createUnavailableToolStub,
  supportsAttachmentUpload,
  readStreamAsBase64,
  getConversationFiles,
  resolveAttachmentUpload,
  addAttachmentUploadHints,
};
