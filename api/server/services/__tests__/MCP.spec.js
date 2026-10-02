const mockRegistry = {
  ensureConfigServers: jest.fn(),
  getAllServerConfigs: jest.fn(),
};

jest.mock('~/config', () => ({
  getMCPServersRegistry: jest.fn(() => mockRegistry),
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getOAuthReconnectionManager: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(() => 'tenant-1'),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
  setCachedTools: jest.fn(),
  getCachedTools: jest.fn(),
  getMCPServerTools: jest.fn(),
  loadCustomConfig: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  /** Pure helpers (normalizeServerName, splitMCPToolKey, schema utils, ...)
   *  stay REAL so key-normalization paths are exercised, not mirrored. */
  ...jest.requireActual('@librechat/api'),
  sendEvent: jest.fn(),
  MCPOAuthHandler: jest.fn(),
  isMCPDomainAllowed: jest.fn(),
  GenerationJobManager: jest.fn(),
  buildOAuthToolCallName: jest.fn((name) => name),
  /** Mirrors the real resolver so these tests still exercise the wrapper's own
   *  plumbing - loading the request config and degrading on failure - rather than
   *  the resolution logic, which is unit-tested in packages/api. Like the real
   *  resolver, a lazy-init failure keeps the name lists. */
  resolveMCPServerContext: jest.fn(async ({ mcpConfig, ensureConfigServers }) => {
    const rawServerNames = Object.keys(mcpConfig);
    let configServers = {};
    try {
      configServers = await ensureConfigServers(mcpConfig);
    } catch {
      /* tolerated: name lists derive from the config snapshot alone */
    }
    return { configServers, serverNames: rawServerNames, rawServerNames };
  }),
}));

jest.mock('~/cache', () => ({ getLogStores: jest.fn() }));
jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  getFiles: jest.fn(),
}));
jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: jest.fn(),
}));
jest.mock('~/server/services/OboTokenService', () => ({
  exchangeOboToken: jest.fn(),
}));
jest.mock('~/server/services/OboPolicyService', () => ({
  createOboTrustChecker: jest.fn(() => async () => true),
}));
jest.mock('~/server/services/Tools/mcp', () => ({
  reinitMCPServer: jest.fn(),
}));
const mockGetStrategyFunctions = jest.fn();
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: (...args) => mockGetStrategyFunctions(...args),
}));

const { Constants } = require('librechat-data-provider');

const { getAppConfig } = require('~/server/services/Config');
const { reinitMCPServer } = require('~/server/services/Tools/mcp');
const { getFiles } = require('~/models');
const {
  createMCPTool,
  healMcpToolNames,
  resolveConfigServers,
  resolveMcpConfigNames,
  resolveAllMcpConfigs,
  resolveMcpServerContext,
  resolveCollisionAuditNames,
  supportsAttachmentUpload,
  resolveAttachmentUpload,
  addAttachmentUploadHints,
} = require('../MCP');

describe('resolveConfigServers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves config servers for the current request context', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: { url: 'http://a' } } });
    mockRegistry.ensureConfigServers.mockResolvedValue({ srv: { name: 'srv' } });

    const result = await resolveConfigServers({ user: { id: 'u1', role: 'admin' } });

    expect(result).toEqual({ srv: { name: 'srv' } });
    expect(getAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', userId: 'u1' }),
    );
    expect(mockRegistry.ensureConfigServers).toHaveBeenCalledWith({ srv: { url: 'http://a' } });
  });

  it('returns {} when ensureConfigServers throws', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('inspect failed'));

    const result = await resolveConfigServers({ user: { id: 'u1' } });

    expect(result).toEqual({});
  });

  it('returns {} when getAppConfig throws', async () => {
    getAppConfig.mockRejectedValue(new Error('db timeout'));

    const result = await resolveConfigServers({ user: { id: 'u1' } });

    expect(result).toEqual({});
  });

  it('passes empty mcpConfig when appConfig has none', async () => {
    getAppConfig.mockResolvedValue({});
    mockRegistry.ensureConfigServers.mockResolvedValue({});

    await resolveConfigServers({ user: { id: 'u1' } });

    expect(mockRegistry.ensureConfigServers).toHaveBeenCalledWith({});
  });
});

describe('resolveMcpServerContext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('derives config servers and all configured names from a single app-config read', async () => {
    /** `ensureConfigServers` intentionally omits unmodified YAML servers, so the name
     *  list must come from `mcpConfig` itself or boundary resolution goes inert. */
    getAppConfig.mockResolvedValue({ mcpConfig: { unchangedYaml: {}, lazyInit: {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({ lazyInit: { name: 'lazyInit' } });

    const result = await resolveMcpServerContext({ user: { id: 'u1' } });

    expect(result.configServers).toEqual({ lazyInit: { name: 'lazyInit' } });
    expect(result.serverNames.sort()).toEqual(['lazyInit', 'unchangedYaml']);
    expect(getAppConfig).toHaveBeenCalledTimes(1);
  });

  it('degrades to empty rather than rejecting when the config lookup fails', async () => {
    /** A rejection here would abort tool loading entirely, defeating the
     *  catch-and-degrade the sibling resolver already provides. */
    getAppConfig.mockRejectedValue(new Error('db timeout'));

    const result = await resolveMcpServerContext({ user: { id: 'u1' } });

    expect(result).toEqual({ configServers: {}, serverNames: [], rawServerNames: [] });
  });

  it('keeps the name lists when only ensureConfigServers throws', async () => {
    /** The name lists derive from the config snapshot alone; losing them
     *  would leave normalized tool keys unresolvable for the whole request —
     *  a strictly worse degradation than missing overlay configs. */
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('inspect failed'));

    const result = await resolveMcpServerContext({ user: { id: 'u1' } });

    expect(result).toEqual({
      configServers: {},
      serverNames: ['srv'],
      rawServerNames: ['srv'],
    });
  });
});

describe('resolveMcpConfigNames', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves current request config server names', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { cfg_srv: {}, yaml_srv: {} } });

    const result = await resolveMcpConfigNames({ user: { id: 'u1', role: 'admin' } });

    expect(result).toEqual(['cfg_srv', 'yaml_srv']);
    expect(getAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', userId: 'u1' }),
    );
  });

  it('returns [] when mcpConfig is absent', async () => {
    getAppConfig.mockResolvedValue({});

    const result = await resolveMcpConfigNames({ user: { id: 'u1' } });

    expect(result).toEqual([]);
  });

  it('propagates getAppConfig failures for write-path callers', async () => {
    getAppConfig.mockRejectedValue(new Error('db timeout'));

    await expect(resolveMcpConfigNames({ user: { id: 'u1' } })).rejects.toThrow('db timeout');
  });
});

describe('resolveAllMcpConfigs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('merges config servers with base servers', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { cfg_srv: {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({ cfg_srv: { name: 'cfg_srv' } });
    mockRegistry.getAllServerConfigs.mockResolvedValue({
      cfg_srv: { name: 'cfg_srv' },
      yaml_srv: { name: 'yaml_srv' },
    });

    const result = await resolveAllMcpConfigs('u1', { id: 'u1', role: 'user' });

    expect(result).toEqual({
      cfg_srv: { name: 'cfg_srv' },
      yaml_srv: { name: 'yaml_srv' },
    });
    expect(mockRegistry.getAllServerConfigs).toHaveBeenCalledWith(
      'u1',
      {
        cfg_srv: { name: 'cfg_srv' },
      },
      'user',
    );
  });

  it('continues with empty configServers when ensureConfigServers fails', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('inspect failed'));
    mockRegistry.getAllServerConfigs.mockResolvedValue({ yaml_srv: { name: 'yaml_srv' } });

    const result = await resolveAllMcpConfigs('u1', { id: 'u1' });

    expect(result).toEqual({ yaml_srv: { name: 'yaml_srv' } });
    expect(mockRegistry.getAllServerConfigs).toHaveBeenCalledWith('u1', {});
  });

  it('propagates getAllServerConfigs failures', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: {} });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockRejectedValue(new Error('redis down'));

    await expect(resolveAllMcpConfigs('u1', { id: 'u1' })).rejects.toThrow('redis down');
  });

  it('propagates getAppConfig failures', async () => {
    getAppConfig.mockRejectedValue(new Error('mongo down'));

    await expect(resolveAllMcpConfigs('u1', { id: 'u1' })).rejects.toThrow('mongo down');
  });
});

describe('healMcpToolNames', () => {
  beforeEach(() => jest.clearAllMocks());

  const req = { user: { id: 'u1', role: 'user' } };

  it('heals a legacy raw-keyed assistant tool to the normalized cache key', async () => {
    /** Assistant docs saved pre-normalization resubmit the raw-suffixed
     *  string on every edit; the controllers' exact lookup would silently
     *  drop the tool. */
    getAppConfig.mockResolvedValue({ mcpConfig: { 'Connector: Company': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'Connector: Company': {} });
    const canonicalKey = `search${Constants.mcp_delimiter}Connector__Company`;
    const toolDefinitions = { [canonicalKey]: { type: 'function' } };

    const healed = await healMcpToolNames({
      req,
      tools: [`search${Constants.mcp_delimiter}Connector: Company`, 'code_interpreter'],
      toolDefinitions,
    });

    expect(healed).toEqual([canonicalKey, 'code_interpreter']);
  });

  it('leaves a SHADOWED raw name untouched (fail closed like the runtime heal)', async () => {
    /** With `foo` and `foo!` both configured, rewriting `search_mcp_foo!`
     *  would land on the WINNER server's key. */
    getAppConfig.mockResolvedValue({ mcpConfig: { foo: {}, 'foo!': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ foo: {}, 'foo!': {} });
    const toolDefinitions = { [`search${Constants.mcp_delimiter}foo`]: { type: 'function' } };

    const healed = await healMcpToolNames({
      req,
      tools: [`search${Constants.mcp_delimiter}foo!`],
      toolDefinitions,
    });

    expect(healed).toEqual([`search${Constants.mcp_delimiter}foo!`]);
  });

  it('skips the config read entirely when every delimiter-bearing name resolves', async () => {
    const key = `search${Constants.mcp_delimiter}srv`;
    const healed = await healMcpToolNames({
      req,
      tools: [key, 'web_search'],
      toolDefinitions: { [key]: { type: 'function' } },
    });

    expect(healed).toEqual([key, 'web_search']);
    expect(getAppConfig).not.toHaveBeenCalled();
  });

  it('fails closed on a CROSS-TIER shadow (user-DB server owns the normalized slot)', async () => {
    /** Operator config alone shows `foo!` unshadowed, but a user-DB server
     *  named `foo` owns the normalized slot — rewriting would bind the
     *  saved assistant to the DB server's tool at execution. */
    getAppConfig.mockResolvedValue({ mcpConfig: { 'foo!': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({
      foo: { name: 'foo' },
      'foo!': { name: 'foo!' },
    });
    const toolDefinitions = { [`search${Constants.mcp_delimiter}foo`]: { type: 'function' } };

    const healed = await healMcpToolNames({
      req,
      tools: [`search${Constants.mcp_delimiter}foo!`],
      toolDefinitions,
    });

    expect(healed).toEqual([`search${Constants.mcp_delimiter}foo!`]);
  });

  it('skips healing entirely when the collision audit cannot complete', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { 'Connector: Company': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockRejectedValue(new Error('redis down'));
    const canonicalKey = `search${Constants.mcp_delimiter}Connector__Company`;

    const healed = await healMcpToolNames({
      req,
      tools: [`search${Constants.mcp_delimiter}Connector: Company`],
      toolDefinitions: { [canonicalKey]: { type: 'function' } },
    });

    expect(healed).toEqual([`search${Constants.mcp_delimiter}Connector: Company`]);
  });

  it('dedupes when the payload carries both spellings of the same tool', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { 'Connector: Company': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockResolvedValue({ 'Connector: Company': {} });
    const canonicalKey = `search${Constants.mcp_delimiter}Connector__Company`;
    const toolDefinitions = { [canonicalKey]: { type: 'function' } };

    const healed = await healMcpToolNames({
      req,
      tools: [
        `search${Constants.mcp_delimiter}Connector: Company`,
        canonicalKey,
        'code_interpreter',
      ],
      toolDefinitions,
    });

    expect(healed).toEqual([canonicalKey, 'code_interpreter']);
  });
});

describe('resolveCollisionAuditNames', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores config names the tolerant merged read silently dropped', async () => {
    /** `resolveAllMcpConfigs` swallows `ensureConfigServers` failures, so a
     *  transient init error can omit a config-only server from the merged
     *  map — the audit would then miss the `foo` / `foo!` collision while
     *  still claiming completeness. The snapshot-derived raw names must be
     *  unioned back in. */
    getAppConfig.mockResolvedValue({ mcpConfig: { 'foo!': {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('init failed'));
    mockRegistry.getAllServerConfigs.mockResolvedValue({ foo: { name: 'foo' } });

    const audit = await resolveCollisionAuditNames({
      rawServerNames: ['foo!'],
      userId: 'u1',
      role: 'user',
    });

    expect(audit.complete).toBe(true);
    expect([...audit.names].sort()).toEqual(['foo', 'foo!']);
  });

  it('reports incomplete when the merged read itself fails', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { 'foo!': {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockRejectedValue(new Error('redis down'));

    const audit = await resolveCollisionAuditNames({
      rawServerNames: ['foo!'],
      userId: 'u1',
      role: 'user',
    });

    expect(audit.complete).toBe(false);
    expect(audit.names).toEqual(['foo!']);
  });
});

describe('createMCPTool', () => {
  beforeEach(() => jest.clearAllMocks());

  const rawServerName = 'Connector: Company';
  const legacyToolKey = `search${Constants.mcp_delimiter}${rawServerName}`;
  const canonicalToolKey = `search${Constants.mcp_delimiter}Connector__Company`;
  const toolFunction = {
    name: canonicalToolKey,
    description: 'Search the company connector',
    parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  };

  it('resolves a legacy raw-spelled key against the normalized availableTools index', async () => {
    /** Assistants and direct tool calls persisted pre-normalization bypass
     *  the agent-boundary heal and arrive with RAW keys; `availableTools`
     *  is keyed canonically, so the lookup must cover both spellings
     *  instead of stubbing the tool as unavailable. */
    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: legacyToolKey,
      serverName: rawServerName,
      availableTools: { [canonicalToolKey]: { type: 'function', function: toolFunction } },
      config: { type: 'stdio', command: 'node' },
      provider: 'openAI',
    });

    expect(toolInstance).toBeDefined();
    expect(toolInstance.name).toBe(canonicalToolKey);
    expect(toolInstance.description).toBe(toolFunction.description);
    expect(reinitMCPServer).not.toHaveBeenCalled();
  });

  it('parses a legacy key whose raw server name contains the delimiter', async () => {
    /** A raw name like `foo_mcp_bar!` defeats the generic last-delimiter
     *  split (`toolName` would become `search_mcp_foo`), so the boundary
     *  candidates must include the RAW resolved name — not only its
     *  normalized form — for the canonical rebuild to hit the index. */
    const delimiterRawName = 'foo_mcp_bar!';
    const legacyKey = `search${Constants.mcp_delimiter}${delimiterRawName}`;
    /** `normalizeServerName` strips the trailing underscore the `!` leaves. */
    const canonicalKey = `search${Constants.mcp_delimiter}foo_mcp_bar`;
    const delimiterToolFunction = {
      name: canonicalKey,
      description: 'Search the delimiter-named server',
      parameters: { type: 'object', properties: {} },
    };

    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: legacyKey,
      serverName: delimiterRawName,
      availableTools: { [canonicalKey]: { type: 'function', function: delimiterToolFunction } },
      config: { type: 'stdio', command: 'node' },
      provider: 'openAI',
    });

    expect(toolInstance).toBeDefined();
    expect(toolInstance.name).toBe(canonicalKey);
    expect(reinitMCPServer).not.toHaveBeenCalled();
  });

  it('still resolves the canonical key directly', async () => {
    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: canonicalToolKey,
      serverName: rawServerName,
      availableTools: { [canonicalToolKey]: { type: 'function', function: toolFunction } },
      config: { type: 'stdio', command: 'node' },
      provider: 'openAI',
    });

    expect(toolInstance).toBeDefined();
    expect(toolInstance.name).toBe(canonicalToolKey);
    expect(reinitMCPServer).not.toHaveBeenCalled();
  });

  it('uses a reference-only schema for configured attachment uploads', async () => {
    const uploadKey = `upload${Constants.mcp_delimiter}files`;
    const uploadDefinition = {
      name: uploadKey,
      description: 'Upload a file',
      parameters: {
        type: 'object',
        properties: { fileName: { type: 'string' }, content: { type: 'string' } },
        required: ['fileName', 'content'],
      },
    };
    getAppConfig.mockResolvedValue({
      mcpConfig: { files: { attachmentUploadTools: ['upload'] } },
    });

    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: uploadKey,
      serverName: 'files',
      availableTools: { [uploadKey]: { type: 'function', function: uploadDefinition } },
      config: { type: 'stdio', command: 'node', attachmentUploadTools: ['upload'] },
      provider: 'openAI',
      requestBody: { conversationId: 'conversation-1' },
    });

    expect(toolInstance.name).toBe(uploadKey);
    expect(toolInstance.mcpJsonSchema.properties.content).toBeUndefined();
    expect(toolInstance.mcpJsonSchema.properties.sourceFileName).toBeDefined();
  });

  it('instructs the model to use an attachment ID when a file is attached', async () => {
    const uploadKey = `upload${Constants.mcp_delimiter}files`;
    const uploadDefinition = {
      name: uploadKey,
      description: 'Upload a file',
      parameters: {
        type: 'object',
        properties: { fileName: { type: 'string' }, content: { type: 'string' } },
        required: ['fileName', 'content'],
      },
    };
    getAppConfig.mockResolvedValue({
      mcpConfig: { files: { attachmentUploadTools: ['upload'] } },
    });

    const toolInstance = await createMCPTool({
      user: { id: 'user-1' },
      toolKey: uploadKey,
      serverName: 'files',
      availableTools: { [uploadKey]: { type: 'function', function: uploadDefinition } },
      config: { type: 'stdio', command: 'node', attachmentUploadTools: ['upload'] },
      provider: 'openAI',
      requestBody: { files: [{ file_id: 'file-1', filename: 'presentation.pptx' }] },
    });

    expect(toolInstance.mcpJsonSchema.properties.sourceFileId).toBeDefined();
    expect(toolInstance.description).toContain('sourceFileId');
    expect(toolInstance.description).not.toContain('sourceFileName');
    expect(toolInstance.description).not.toContain('base64');
  });
});

// Deloitte Custom Change: attachment uploads are resolved from authorized request files.
describe('resolveAttachmentUpload', () => {
  beforeEach(() => jest.clearAllMocks());

  it('replaces sourceFileId with the authorized attachment bytes', async () => {
    const { Readable } = require('stream');
    const stream = Readable.from([Buffer.from('p'), Buffer.from('ptx bytes')]);
    const getDownloadStream = jest.fn().mockResolvedValue({ data: stream });
    const req = { user: { id: 'user-1' } };
    const attachment = {
      file_id: 'file-1',
      source: 'azure_blob',
      filepath: '/attachments/file-1',
    };
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getFiles.mockResolvedValue([attachment]);

    const result = await resolveAttachmentUpload({
      toolArguments: { sourceFileId: 'file-1', fileName: 'presentation.pptx' },
      requestBody: { files: [attachment] },
      req,
      user: { id: 'user-1' },
    });

    expect(result).toEqual({
      fileName: 'presentation.pptx',
      content: Buffer.from('pptx bytes').toString('base64'),
      encoding: 'base64',
    });
    expect(mockGetStrategyFunctions).toHaveBeenCalledWith('azure_blob');
    expect(getDownloadStream).toHaveBeenCalledWith(req, attachment.filepath);
  });

  it('resolves a generated file by the current conversation and user', async () => {
    const { Readable } = require('stream');
    const getDownloadStream = jest
      .fn()
      .mockResolvedValue(Readable.from([Buffer.from('pptx bytes')]));
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getFiles.mockResolvedValue([
      {
        file_id: 'file-1',
        filename: 'testsp7.pptx',
        source: 'local',
        filepath: '/uploads/file-1',
      },
    ]);

    const result = await resolveAttachmentUpload({
      toolArguments: { sourceFileName: 'testsp7.pptx' },
      requestBody: { conversationId: 'conversation-1' },
      req: {},
      user: { id: 'user-1' },
    });

    expect(getFiles).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', user: 'user-1' },
      null,
      { text: 0 },
    );
    expect(result).toEqual({
      content: Buffer.from('pptx bytes').toString('base64'),
      encoding: 'base64',
    });
  });

  it('rejects a missing source reference', async () => {
    await expect(
      resolveAttachmentUpload({ toolArguments: { fileName: 'presentation.pptx' } }),
    ).rejects.toThrow('Specify exactly one of sourceFileId or sourceFileName');
  });

  it('rejects a sourceFileId that is not attached to the current request', async () => {
    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileId: 'other-user-file' },
        requestBody: { files: [{ file_id: 'file-1' }] },
      }),
    ).rejects.toThrow('Attachment source must identify a file available to the current user');
  });

  it('rejects an empty sourceFileId instead of forwarding an incomplete upload', async () => {
    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileId: '' },
        requestBody: { files: [] },
      }),
    ).rejects.toThrow('sourceFileId must be a non-empty string');
  });

  it('accepts storage strategies that return a stream directly', async () => {
    const { Readable } = require('stream');
    const stream = Readable.from([Buffer.from('pptx bytes')]);
    mockGetStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(stream),
    });
    getFiles.mockResolvedValue([{ file_id: 'file-1', source: 'azure_blob', filepath: '/file-1' }]);

    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileId: 'file-1' },
        requestBody: { files: [{ file_id: 'file-1', source: 'azure_blob', filepath: '/file-1' }] },
      }),
    ).resolves.toMatchObject({ content: Buffer.from('pptx bytes').toString('base64') });
  });
});

// Deloitte Custom Change: only configured MCP tools receive attachment identifiers.
describe('addAttachmentUploadHints', () => {
  it('lists current-request attachments for an explicitly configured upload tool', () => {
    const schema = {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Base64-encoded content.' },
      },
      required: ['driveId', 'content'],
    };

    const result = addAttachmentUploadHints(
      schema,
      'sp_upload_file',
      { attachmentUploadTools: ['sp_upload_file'] },
      { files: [{ file_id: 'file-1', filename: 'presentation.pptx' }] },
    );

    expect(result.properties.sourceFileId.description).toContain('file-1 (presentation.pptx)');
    expect(result.properties.content).toBeUndefined();
    expect(result.required).toEqual(['driveId']);
    expect(schema.properties.sourceFileId).toBeUndefined();
    expect(schema.required).toEqual(['driveId', 'content']);
  });

  it('does not expose attachment IDs to an unconfigured tool', () => {
    const schema = { properties: { content: { description: 'Base64-encoded content.' } } };

    expect(
      addAttachmentUploadHints(
        schema,
        'sp_upload_file',
        {},
        { files: [{ file_id: 'file-1', filename: 'presentation.pptx' }] },
      ),
    ).toBe(schema);
  });

  it('requires a generated conversation file name when no request attachment exists', () => {
    const result = addAttachmentUploadHints(
      {
        properties: { content: { type: 'string' } },
        required: ['content'],
      },
      'sp_upload_file',
      { attachmentUploadTools: ['sp_upload_file'] },
      { conversationId: 'conversation-1' },
    );

    expect(result.properties.content).toBeUndefined();
    expect(result.properties.sourceFileName).toBeDefined();
    expect(result.required).toEqual([]);
  });

  it('requires a provider-compatible source reference for Google schemas', () => {
    const schema = { properties: { content: { type: 'string' } }, required: ['content'] };

    expect(
      addAttachmentUploadHints(
        schema,
        'sp_upload_file',
        { attachmentUploadTools: ['sp_upload_file'] },
        { files: [{ file_id: 'file-1' }] },
        true,
      ).required,
    ).toEqual(['sourceFileId']);
    expect(
      addAttachmentUploadHints(
        schema,
        'sp_upload_file',
        { attachmentUploadTools: ['sp_upload_file'] },
        { conversationId: 'conversation-1' },
        true,
      ).required,
    ).toEqual(['sourceFileName']);
  });
});

describe('supportsAttachmentUpload', () => {
  it('requires an explicit server configuration allowlist entry', () => {
    expect(
      supportsAttachmentUpload({ attachmentUploadTools: ['sp_upload_file'] }, 'sp_upload_file'),
    ).toBe(true);
    expect(
      supportsAttachmentUpload(
        { source: 'user', attachmentUploadTools: ['sp_upload_file'] },
        'sp_upload_file',
      ),
    ).toBe(false);
    expect(supportsAttachmentUpload({}, 'sp_upload_file')).toBe(false);
  });
});
