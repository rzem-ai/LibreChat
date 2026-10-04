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
  buildServerNameAliases,
  findShadowedServerNames,
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
  checkAccessWithRequestCache,
  getMissingCustomUserVars,
  getServerCustomUserVars,
  requiresEphemeralUserConnection,
  requiresOAuthMachinery,
  hasRuntimeUrlPlaceholders,
  containsGraphTokenPlaceholder,
  isOAuthServer,
  isOboServer,
  sanitizeFilename,
  fetchAllowedCodeFileStream,
  HOST_FILE_AUTHORING_ARTIFACT_KEY,
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
  mergeFileConfig,
  getEndpointFileConfig,
  isAssistantsEndpoint,
  FileSources,
  FileContext,
  checkOpenAIStorage,
} = require('librechat-data-provider');
const {
  getOAuthReconnectionManager,
  getMCPServersRegistry,
  getFlowStateManager,
  getMCPManager,
} = require('~/config');
const db = require('~/models');
const { findToken, createToken, updateToken, deleteTokens } = db;
const { getGraphApiToken } = require('./GraphTokenService');
const { exchangeOboToken } = require('./OboTokenService');
const { createOboTrustChecker } = require('./OboPolicyService');
const { reinitMCPServer } = require('./Tools/mcp');
const { getAppConfig, checkCapability } = require('./Config');
const { getStrategyFunctions } = require('./Files/strategies');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { Readable } = require('stream');
const { getLogStores } = require('~/cache');
const { uploadCodeEnvFile } = require('~/server/services/Files/Code/crud');

const MAX_CACHE_SIZE = 1000;
const lastReconnectAttempts = new Map();
const RECONNECT_THROTTLE_MS = 10_000;

const missingToolCache = new Map();
const MISSING_TOOL_TTL_MS = 10_000;
const MAX_ATTACHMENT_UPLOAD_BYTES = 7 * 1024 * 1024;

/**
 * Deloitte Custom Change: Only explicitly trusted MCP tools may receive attachment bytes.
 * Determines whether an admin-configured MCP server may receive attachment bytes for a tool.
 * @param {object | undefined} serverConfig - Resolved MCP server configuration.
 * @param {string} toolName - Raw MCP tool name.
 * @returns {boolean} Whether the tool is authorized for attachment-backed uploads.
 */
function supportsAttachmentUpload(serverConfig, toolName) {
  return (
    serverConfig != null &&
    !isUserSourced(serverConfig) &&
    Array.isArray(serverConfig?.attachmentUploadTools) &&
    serverConfig.attachmentUploadTools.includes(toolName)
  );
}

/**
 * Selects the model-facing reference for the files available in this request.
 * Current attachments have stable IDs; earlier generated files use filenames.
 * @param {import('@librechat/api').RequestBody | undefined} requestBody - Current request body.
 * @returns {'sourceFileId' | 'sourceFileName'} The preferred attachment reference field.
 */
function getAttachmentSourceField(requestBody) {
  return requestBody?.files?.some((file) => typeof file?.file_id === 'string')
    ? 'sourceFileId'
    : 'sourceFileName';
}

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
 * Deloitte Custom Change: Encode attachment bytes locally so the language model never relays them.
 * Reads a file stream into a base64 string without retaining the entire raw file in memory.
 * @param {NodeJS.ReadableStream} stream - The authorized attachment stream.
 * @returns {Promise<string>} The original stream bytes encoded as standard base64.
 */
async function readStreamAsBase64(stream) {
  /** @type {string[]} */
  const encodedChunks = [];
  let remainder = Buffer.alloc(0);
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_ATTACHMENT_UPLOAD_BYTES) {
      throw new Error(`Attachment exceeds the ${MAX_ATTACHMENT_UPLOAD_BYTES / (1024 * 1024)}MB upload limit`);
    }
    const data = remainder.length > 0 ? Buffer.concat([remainder, bytes]) : bytes;
    const completeLength = data.length - (data.length % 3);
    if (completeLength > 0) {
      encodedChunks.push(data.subarray(0, completeLength).toString('base64'));
    }
    remainder = data.subarray(completeLength);
  }
  if (remainder.length > 0) {
    encodedChunks.push(remainder.toString('base64'));
  }
  return encodedChunks.join('');
}

/**
 * Deloitte Custom Change: Resolve code-generated files only from the current user's active conversation.
 * @param {import('@librechat/api').RequestBody | undefined} requestBody - Current request body.
 * @param {import('librechat-data-provider').TUser | undefined} user - Current authenticated user.
 * @returns {Promise<object[]>} Conversation files that belong to the current user.
 */
async function getConversationFiles(requestBody, user) {
  if (!requestBody?.conversationId || !user?.id) {
    return [];
  }

  return (
    (await db.getFiles(
      {
        conversationId: requestBody.conversationId,
        user: user.id,
        context: FileContext.execute_code,
        'metadata.codeEnvRef': { $exists: true },
      },
      null,
      { text: 0 },
    )) ?? []
  );
}

/**
 * Returns a Node-readable stream for an authorized persisted file.
 * OpenAI and Azure files require an endpoint-specific client; other storage
 * strategies use the standard request/path stream signature.
 * @param {object} attachment - Persisted file document.
 * @param {ServerRequest | undefined} req - Authenticated request.
 * @param {import('express').Response | undefined} res - Active response.
 * @returns {Promise<NodeJS.ReadableStream>} Download stream for the file.
 */
async function getAttachmentDownloadStream(attachment, req, res) {
  if (attachment.context === FileContext.execute_code) {
    const ref = attachment.metadata?.codeEnvRef;
    if (!ref || !ref.storage_session_id || !ref.file_id || !ref.kind || !ref.id) {
      throw new Error('Attached execute_code file has no code environment reference');
    }
    const identity =
      ref.kind === 'skill'
        ? { kind: ref.kind, id: ref.id, version: ref.version }
        : { kind: ref.kind, id: ref.id };
    const { getDownloadStream: getCodeStream } = getStrategyFunctions(FileSources.execute_code);
    if (typeof getCodeStream !== 'function') {
      throw new Error('Attached execute_code file cannot be downloaded');
    }
    const response = await getCodeStream(`${ref.storage_session_id}/${ref.file_id}`, identity, req);
    return response.data;
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
async function resolveAttachmentUpload({ toolArguments, requestBody, req, res, user }) {
  if (toolArguments == null || typeof toolArguments !== 'object' || Array.isArray(toolArguments)) {
    return toolArguments;
  }

  const hasSourceFileId = Object.prototype.hasOwnProperty.call(toolArguments, 'sourceFileId');
  const hasSourceFileName = Object.prototype.hasOwnProperty.call(toolArguments, 'sourceFileName');
  const hasSourceFile = Object.prototype.hasOwnProperty.call(toolArguments, 'sourceFile');
  if (Number(hasSourceFileId) + Number(hasSourceFileName) + Number(hasSourceFile) !== 1) {
    throw new Error('Specify exactly one attachment source reference');
  }
  const sourceFileId = toolArguments.sourceFileId;
  const sourceFileName = toolArguments.sourceFileName;
  const sourceFile = toolArguments.sourceFile;

  if (hasSourceFileId && (typeof sourceFileId !== 'string' || sourceFileId.trim() === '')) {
    throw new Error('sourceFileId must be a non-empty string');
  }
  if (hasSourceFileName && (typeof sourceFileName !== 'string' || sourceFileName.trim() === '')) {
    throw new Error('sourceFileName must be a non-empty string');
  }
  if (hasSourceFile && (typeof sourceFile !== 'string' || sourceFile.trim() === '')) {
    throw new Error('sourceFile must be a non-empty string');
  }

  const requestFileIds = new Set(
    (requestBody?.files ?? []).map((file) => file?.file_id).filter((fileId) => typeof fileId === 'string'),
  );
  const matchingAttachments = hasSourceFileId || (hasSourceFile && requestFileIds.has(sourceFile))
    ? requestFileIds.has(sourceFileId ?? sourceFile)
      ? (await db.getFiles({ file_id: sourceFileId ?? sourceFile, user: user?.id }, null, { text: 0 })) ?? []
      : []
    : (await getConversationFiles(requestBody, user)).filter(
        (file) => file?.filename === (sourceFileName ?? sourceFile),
      );
  if (matchingAttachments.length !== 1) {
    throw new Error('Attachment source must identify a file available to the current user');
  }
  const [attachment] = matchingAttachments;

  const stream = await getAttachmentDownloadStream(attachment, req, res);
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new Error(`Attached file source "${attachment.source}" did not return a readable stream`);
  }
  try {
    const {
      sourceFileId: _sourceFileId,
      sourceFileName: _sourceFileName,
      sourceFile: _sourceFile,
      ...uploadArguments
    } = toolArguments;
    return {
      ...uploadArguments,
      content: await readStreamAsBase64(stream),
      encoding: 'base64',
    };
  } finally {
    if (typeof stream?.destroy === 'function' && !stream.destroyed) {
      stream.destroy();
    }
  }
}

/**
 * Deloitte Custom Change: Give approved upload tools the active request's attachment IDs.
 * Adds current-request attachment identifiers to an authorized upload tool schema.
 * @param {object | null} schema - MCP tool JSON schema.
 * @param {string} toolName - Raw MCP tool name.
 * @param {object | undefined} serverConfig - Resolved MCP server configuration.
 * @param {import('@librechat/api').RequestBody | undefined} requestBody - Current request body.
 * @returns {object | null} Schema with attachment hints when applicable.
 */
function addAttachmentUploadHints(schema, toolName, serverConfig, requestBody, isGoogle = false) {
  if (!supportsAttachmentUpload(serverConfig, toolName)) {
    return schema;
  }

  const attachments = requestBody?.files?.filter((file) => typeof file?.file_id === 'string') ?? [];

  const required = (schema.required ?? []).filter(
    (property) =>
      property !== 'content' &&
      property !== 'encoding' &&
      property !== 'sourceFileId' &&
      property !== 'sourceFileName',
  );
  // Deloitte Custom Change: prevent the model from streaming file bytes through the tool call.
  const { content: _content, encoding: _encoding, ...properties } = schema.properties ?? {};
  const uploadSchema = {
    ...schema,
    properties: {
      ...properties,
      sourceFileId: {
        type: 'string',
        description: `ID of a file attached to the current request. LibreChat resolves it to the original bytes. Current request attachments: ${attachments.map((file) => `${file.file_id} (${file.filename ?? 'attached file'})`).join(', ')}.`,
      },
      sourceFileName: {
        type: 'string',
        description: 'Exact filename of a file created earlier in this conversation. LibreChat resolves it to the original bytes.',
      },
    },
    required,
  };
  if (isGoogle) {
    return {
      ...uploadSchema,
      properties: {
        ...properties,
        sourceFile: {
          type: 'string',
          description:
            'ID of a file attached to the current request, or exact filename of a file created earlier in this conversation. LibreChat resolves it to the original bytes.',
        },
      },
      required: [...required, 'sourceFile'],
    };
  }
  return { ...uploadSchema, oneOf: [{ required: ['sourceFileId'] }, { required: ['sourceFileName'] }] };
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
  } catch (error) {
    logger.error(`[MCP][User: ${user.id}] Failed MCP permission check`, error);
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
  return await getAppConfig({ role: user?.role, tenantId: getTenantId(), userId });
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
  } catch (error) {
    logger.warn(
      '[resolveConfigServers] Failed to resolve config servers, degrading to empty:',
      error,
    );
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
 * for the legacy-key heal's collision detection in `initializeAgent`. Only
 * consulted when a configured server name needs normalization.
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
async function healMcpToolNames({ req, tools, toolDefinitions }) {
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
  const rawServerNames = await resolveMcpConfigNames(req);
  /** Cross-tier shadowing (DB `foo` vs operator `foo!`) is invisible to
   *  operator names alone — the shadow set must come from the FULL
   *  accessible audit. Every rewrite candidate here is normalization-
   *  sensitive by construction, so an incomplete audit skips healing
   *  entirely (the raw key stays raw and fails closed). */
  const audit = await resolveCollisionAuditNames({
    rawServerNames,
    userId: req.user?.id,
    role: req.user?.role,
  });
  if (!audit.complete) {
    return list;
  }
  const shadowed = findShadowedServerNames(audit.names);
  const seen = new Set();
  const healedList = [];
  for (const tool of list) {
    let healedTool = tool;
    if (
      typeof tool === 'string' &&
      tool.includes(Constants.mcp_delimiter) &&
      toolDefinitions[tool] == null
    ) {
      const [, parsedServerName] = splitMCPToolKey(tool, rawServerNames);
      if (
        parsedServerName != null &&
        rawServerNames.includes(parsedServerName) &&
        !shadowed.has(parsedServerName)
      ) {
        const healed = normalizeMCPToolKey(tool, rawServerNames);
        if (toolDefinitions[healed] != null) {
          healedTool = healed;
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

async function resolveAllMcpConfigs(userId, user) {
  const registry = getMCPServersRegistry();
  const appConfig = await getAppConfigForUser(userId, user);
  let configServers = {};
  try {
    configServers = await registry.ensureConfigServers(appConfig?.mcpConfig || {});
  } catch (error) {
    logger.warn(
      '[resolveAllMcpConfigs] Config server resolution failed, continuing without:',
      error,
    );
  }
  if (user?.role) {
    return await registry.getAllServerConfigs(userId, configServers, user.role);
  }

  return await registry.getAllServerConfigs(userId, configServers);
}

/**
 * Best-effort early gate; the authoritative check is
 * `assertResolvedRuntimeConfigAllowed` in `@librechat/api`, whose resolution
 * this must mirror. Graph placeholders resolve later (async), so a URL still
 * carrying one defers to the authoritative check instead of rejecting here.
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
    options: serverConfig,
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
 * @param {object} params
 * @param {string} params.userId - The ID of the user.
 * @param {string} params.serverName - The name of the server.
 * @param {string} params.toolName - The name of the tool.
 * @param {string} [params.tenantId] - The tenant ID for the current request.
 * @param {FlowStateManager<any>} params.flowManager - The flow manager instance.
 */
function createAbortHandler({ userId, serverName, toolName, tenantId, flowManager }) {
  return function () {
    logger.info(`[MCP][User: ${userId}][${serverName}][${toolName}] Tool call aborted`);
    const flowId = getOAuthFlowId(userId, serverName, tenantId);
    // Clean up both mcp_oauth and mcp_get_tokens flows
    flowManager.failFlow(flowId, 'mcp_oauth', new Error('Tool call aborted'));
    flowManager.failFlow(flowId, 'mcp_get_tokens', new Error('Tool call aborted'));
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

/**
 * @param {Object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
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
  streamId = null,
  jobCreatedAt,
}) {
  logger.debug(
    `[MCP][reconnectServer] serverName: ${serverName}, user: ${user?.id}, hasUserMCPAuthMap: ${!!userMCPAuthMap}`,
  );

  // Request-scoped servers reconnect on every message by design; throttling them
  // would stub out healthy tools for messages sent within the throttle window.
  const requestScoped = serverConfig ? requiresEphemeralUserConnection(serverConfig) : false;
  if (!requestScoped) {
    const throttleKey = `${user.id}:${serverName}`;
    const now = Date.now();
    const lastAttempt = lastReconnectAttempts.get(throttleKey) ?? 0;
    if (now - lastAttempt < RECONNECT_THROTTLE_MS) {
      logger.debug(`[MCP][reconnectServer] Throttled reconnect for ${serverName}`);
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

  // Set up abort handler to clean up OAuth flows if request is aborted
  const tenantId = user?.tenantId ?? getTenantId();
  const oauthFlowId = getOAuthFlowId(user.id, serverName, tenantId);
  const abortHandler = () => {
    logger.info(
      `[MCP][User: ${user.id}][${serverName}] Tool loading aborted, cleaning up OAuth flows`,
    );
    // Clean up both mcp_oauth and mcp_get_tokens flows
    flowManager.failFlow(oauthFlowId, 'mcp_oauth', new Error('Tool loading aborted'));
    flowManager.failFlow(oauthFlowId, 'mcp_get_tokens', new Error('Tool loading aborted'));
  };

  if (signal) {
    signal.addEventListener('abort', abortHandler, { once: true });
  }

  try {
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
      forceNew: true,
      returnOnOAuth: false,
      connectionTimeout: Time.THIRTY_SECONDS,
    });
  } finally {
    // Clean up abort handler to prevent memory leaks
    if (signal) {
      signal.removeEventListener('abort', abortHandler);
    }
  }
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
  streamId = null,
  jobCreatedAt,
}) {
  const serverConfig =
    config ?? (await getMCPServersRegistry().getServerConfig(serverName, user?.id, configServers));

  if (serverConfig?.url) {
    const appConfig = await getAppConfig({
      role: user?.role,
      tenantId: user?.tenantId,
      userId: user?.id,
    });
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
      logger.warn(`[MCP][${serverName}] Domain not allowed, skipping all tools`);
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
    streamId,
    jobCreatedAt,
  });
  if (result === null) {
    logger.debug(`[MCP][${serverName}] Reconnect throttled, skipping tool creation.`);
    return [];
  }
  if (!result || !result.tools) {
    logger.warn(`[MCP][${serverName}] Failed to reinitialize MCP server.`);
    return [];
  }

  const serverTools = [];
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
      availableTools: result.availableTools,
      serverName,
      /** Model-facing key: matches the normalized `availableTools` keys and
       *  the instance name `createToolInstance` will assign. */
      toolKey: `${tool.name}${Constants.mcp_delimiter}${normalizeServerName(serverName)}`,
      requestBody,
      requestScopedConnections,
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
  serverName: resolvedServerName,
  onAvailableTools,
  streamId = null,
  jobCreatedAt,
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
      logger.warn(`[MCP][${serverName}] Domain no longer allowed, skipping tool: ${toolName}`);
      return undefined;
    }
  }

  /** Legacy keys persisted pre-normalization (assistants, direct tool
   *  calls) carry the RAW server name, while `availableTools` is keyed by
   *  the canonical normalized key — look up both spellings. */
  const canonicalToolKey =
    serverName != null
      ? `${toolName}${Constants.mcp_delimiter}${normalizeServerName(serverName)}`
      : toolKey;
  const findToolDefinition = (tools) =>
    tools?.[toolKey]?.function ??
    (canonicalToolKey !== toolKey ? tools?.[canonicalToolKey]?.function : undefined);

  /** @type {LCTool | undefined} */
  let toolDefinition = findToolDefinition(availableTools);
  if (!toolDefinition) {
    const cachedAt = useMissingToolCache ? missingToolCache.get(toolKey) : undefined;
    if (cachedAt && Date.now() - cachedAt < MISSING_TOOL_TTL_MS) {
      logger.debug(
        `[MCP][${serverName}][${toolName}] Tool in negative cache, returning unavailable stub.`,
      );
      return createUnavailableToolStub(toolName, serverName);
    }

    logger.warn(
      `[MCP][${serverName}][${toolName}] Requested tool not found in available tools, re-initializing MCP server.`,
    );
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
      streamId,
      jobCreatedAt,
    });
    if (result?.availableTools) {
      onAvailableTools?.(result.availableTools);
    }
    toolDefinition = findToolDefinition(result?.availableTools);

    if (!toolDefinition && useMissingToolCache) {
      missingToolCache.set(toolKey, Date.now());
      evictStale(missingToolCache, MISSING_TOOL_TTL_MS);
    }
  }

  if (!toolDefinition) {
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
    toolName,
    serverName,
    serverConfig,
    toolDefinition,
    streamId,
    jobCreatedAt,
  });
}

function createToolInstance({
  res,
  mcpPermissionContext,
  user: capturedUser = null,
  requestBody: capturedRequestBody,
  requestScopedConnections: capturedRequestScopedConnections,
  toolName,
  serverName,
  serverConfig: capturedServerConfig,
  toolDefinition,
  provider: capturedProvider,
  streamId = null,
  jobCreatedAt,
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
  schema = addAttachmentUploadHints(schema, toolName, capturedServerConfig, capturedRequestBody, isGoogle);
  const attachmentUpload = supportsAttachmentUpload(capturedServerConfig, toolName);
  const attachmentSourceField = isGoogle ? 'sourceFile' : getAttachmentSourceField(capturedRequestBody);
  const attachmentUploadDescription = attachmentUpload
    ? `Upload a file already available in this conversation. Provide the destination fields and ${attachmentSourceField}. Never provide content, file bytes, or encoding: LibreChat reads and encodes the file after this tool call.`
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
    const userId = effectiveUser?.id || config?.configurable?.user_id || capturedUser?.id;
    /** @type {ReturnType<typeof createAbortHandler>} */
    let abortHandler = null;
    /** @type {AbortSignal} */
    let derivedSignal = null;

    try {
      const provider = (config?.metadata?.provider || capturedProvider)?.toLowerCase();
      const canUseMCP = mcpPermissionContext
        ? await mcpPermissionContext.canUseServers(permissionUser)
        : await userCanUseMCPServers(permissionUser);
      if (!canUseMCP) {
        throw new Error('Forbidden: Insufficient MCP server permissions');
      }
      const flowsCache = getLogStores(CacheKeys.FLOWS);
      const flowManager = getFlowStateManager(flowsCache);
      derivedSignal = config?.signal ? AbortSignal.any([config.signal]) : undefined;
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

      if (derivedSignal) {
        const tenantId = config?.configurable?.user?.tenantId ?? getTenantId();
        abortHandler = createAbortHandler({ userId, serverName, toolName, tenantId, flowManager });
        derivedSignal.addEventListener('abort', abortHandler, { once: true });
      }

      const customUserVars =
        config?.configurable?.userMCPAuthMap?.[`${Constants.mcp_prefix}${serverName}`];
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
          })
        : toolArguments;

      const callToolOptions = {
        serverName,
        serverConfig: capturedServerConfig,
        toolName,
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
        oauthStart,
        oauthEnd,
        graphTokenResolver: getGraphApiToken,
        oboTokenResolver: exchangeOboToken,
        oboTrustChecker: createOboTrustChecker(),
        // Extract every trusted gateway response so its short-lived URL never
        // reaches model context, even when this caller cannot use Code Interpreter.
        extractSharePointAttachment: isTrustedSharePointAttachmentTool,
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
      if (
        artifacts?.codeFile &&
        isAssistantsEndpoint(provider)
      ) {
        if (Array.isArray(result) && !result[0]) {
          result[0] = `File "${sanitizeFilename(artifacts.codeFile.name)}" could not be attached to this conversation for use in Code Interpreter.`;
        }
      } else if (
        artifacts?.codeFile
      ) {
        const { name, url, mimeType, gatewayDownload, size, expiresAt } = artifacts.codeFile;
        // Deloitte Custom Change: gateway filenames are untrusted and must never reach model context or logs unsanitized.
        const sanitizedFilename = sanitizeFilename(name);
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
          logger.warn(
              `[MCP][${serverName}][${toolName}][User: ${userId}] Dropped codeFile artifact "${sanitizedFilename}": no request context available to register it with Code Interpreter.`,
          );
        } else if (capabilityCheckFailed) {
          codeFileRegistrationFailed = true;
          // Already logged above.
        } else if (!hasExecuteCodeCapability) {
          codeFileRegistrationFailed = true;
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
            if (gatewayDownload && responseMimeType && responseMimeType !== mimeType?.toLowerCase()) {
              throw new Error('codeFile download content type does not match the gateway declaration');
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
        /* Marker-only tool responses (`result[0] === ''`) rely entirely on the
         * codeFile artifact to tell the model anything happened. Losing that
         * artifact above without a substitute leaves the model with no signal
         * at all, so fall back to a plain, non-secret status line instead.
         * This also fires when `fetchAllowedCodeFileStream`/`uploadCodeEnvFile`
         * themselves failed (disallowed/expired URL, network error), so the
         * wording must stay neutral about whether the download itself
         * succeeded. */
        if (codeFileRegistrationFailed && Array.isArray(result) && !result[0]) {
          result[0] = `File "${sanitizedFilename}" could not be attached to this conversation for use in Code Interpreter.`;
        }
      }

      if (isAssistantsEndpoint(provider) && Array.isArray(result)) {
        return result[0];
      }
      return result;
    } catch (error) {
      logger.error(
        `[MCP][${serverName}][${toolName}][User: ${userId}] Error calling MCP tool:`,
        error,
      );

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
    } finally {
      // Clean up abort handler to prevent memory leaks
      if (abortHandler && derivedSignal) {
        derivedSignal.removeEventListener('abort', abortHandler);
      }
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
 * @param {{ role?: string, tenantId?: string }} [options] - Optional role/tenant context
 * @returns {Object} Object containing mcpConfig, appConnections, userConnections, and oauthServers
 */
async function getMCPSetupData(userId, options = {}) {
  const registry = getMCPServersRegistry();
  const { role, tenantId } = options;

  const appConfig = await getAppConfig({ role, tenantId, userId });
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
 * @returns {Object} Object containing requiresOAuth, connectionState, and configuredObo
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
    connectionState: finalConnectionState,
    authorizationState,
    configuredObo: isOboConfig,
  };
}

module.exports = {
  createMCPTool,
  createMCPTools,
  createMCPPermissionContext,
  userCanUseMCPServers,
  getMCPSetupData,
  resolveConfigServers,
  resolveMcpServerNames,
  resolveMcpServerContext,
  getAccessibleMcpServerNames,
  healMcpToolNames,
  resolveCollisionAuditNames,
  resolveMcpConfigNames,
  resolveAllMcpConfigs,
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
