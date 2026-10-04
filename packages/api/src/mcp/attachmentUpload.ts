import type { IMongoFile } from '@librechat/data-schemas';
import { EModelEndpoint, FileContext, FileSources } from 'librechat-data-provider';
import type { Response } from 'express';
import type { Readable } from 'stream';
import type { ServerRequest } from '~/types/http';

const MAX_ATTACHMENT_UPLOAD_BYTES = 7 * 1024 * 1024;

type JsonObject = Record<string, unknown>;
type AttachmentUploadStream = Readable;
type AttachmentUploadFile = IMongoFile & { source: FileSources; context?: FileContext };
type AttachmentReference = Pick<IMongoFile, 'file_id' | 'filename'>;
type CodeEnvironmentIdentity =
  | { kind: 'skill'; id: string; version: number }
  | { kind: 'agent' | 'user'; id: string };

interface ProviderFileResponse {
  body?: Readable | ReadableStream<Uint8Array> | null;
}

interface ProviderClient {
  files: {
    content(fileId: string): Promise<ProviderFileResponse>;
  };
}

interface StorageDownloadStrategy {
  getDownloadStream?: (req: ServerRequest, filepath: string) => Promise<Readable>;
}

interface CodeEnvironmentDownloadStrategy {
  getDownloadStream?: (
    fileIdentifier: string,
    identity: CodeEnvironmentIdentity,
    req: ServerRequest,
  ) => Promise<{ data: Readable }>;
}

export interface AttachmentUploadServerConfig {
  source?: string;
  dbId?: string;
  attachmentUploadTools?: string[];
}

export interface AttachmentUploadRequestBody {
  conversationId?: string;
  files?: AttachmentReference[];
}

export interface AttachmentUploadDependencies {
  getFiles: (
    query: Record<string, string | FileContext | { $exists: true } | undefined>,
    projection: null,
    options: { text: 0 },
  ) => Promise<AttachmentUploadFile[] | null>;
  getAttachmentDownloadStream: (attachment: AttachmentUploadFile) => Promise<AttachmentUploadStream>;
}

export interface AttachmentDownloadDependencies {
  getStorageDownloadStrategy: (source: FileSources) => StorageDownloadStrategy;
  getCodeEnvironmentDownloadStrategy: () => CodeEnvironmentDownloadStrategy;
  checkOpenAIStorage: (source: FileSources) => boolean;
  getOpenAIClient: (params: {
    req: ServerRequest;
    res: Response;
    overrideEndpoint: EModelEndpoint;
  }) => Promise<{ openai: ProviderClient }>;
  readableFromWeb: (body: ReadableStream<Uint8Array>) => AttachmentUploadStream;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUserSourced(serverConfig: AttachmentUploadServerConfig | undefined): boolean {
  return serverConfig?.source != null ? serverConfig.source === 'user' : Boolean(serverConfig?.dbId);
}

/** Returns whether an operator-configured MCP tool may receive attachment bytes. */
export function supportsAttachmentUpload(
  serverConfig: AttachmentUploadServerConfig | undefined,
  toolName: string,
): boolean {
  return (
    !isUserSourced(serverConfig) &&
    Array.isArray(serverConfig?.attachmentUploadTools) &&
    serverConfig.attachmentUploadTools.includes(toolName)
  );
}

/** Chooses the attachment reference field that should be shown to the model. */
export function getAttachmentSourceField(
  requestBody: AttachmentUploadRequestBody | undefined,
): 'sourceFileId' | 'sourceFileName' {
  return requestBody?.files?.some((file) => typeof file?.file_id === 'string')
    ? 'sourceFileId'
    : 'sourceFileName';
}

/** Restores the trusted YAML allowlist when inspected server configs omit it. */
export function applyAttachmentUploadConfig<T extends AttachmentUploadServerConfig>(
  serverConfig: T | undefined,
  serverName: string,
  appConfig: { mcpConfig?: Record<string, AttachmentUploadServerConfig> } | undefined,
): T | (T & { attachmentUploadTools: string[] }) | undefined {
  if (!serverConfig || isUserSourced(serverConfig)) {
    return serverConfig;
  }

  const attachmentUploadTools = appConfig?.mcpConfig?.[serverName]?.attachmentUploadTools;
  if (!Array.isArray(attachmentUploadTools)) {
    return serverConfig;
  }

  return { ...serverConfig, attachmentUploadTools };
}

/** Encodes an attachment stream without retaining its raw contents in memory. */
export async function readStreamAsBase64(stream: AttachmentUploadStream): Promise<string> {
  const encodedChunks: string[] = [];
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

/** Resolves a persisted attachment to a stream through its configured download strategy. */
export async function getAttachmentDownloadStream({
  attachment,
  req,
  res,
  dependencies,
}: {
  attachment: AttachmentUploadFile;
  req: ServerRequest;
  res: Response;
  dependencies: AttachmentDownloadDependencies;
}): Promise<AttachmentUploadStream> {
  if (attachment.context === FileContext.execute_code) {
    const ref = attachment.metadata?.codeEnvRef;
    if (!ref || !ref.storage_session_id || !ref.file_id || !ref.kind || !ref.id) {
      throw new Error('Attached execute_code file has no code environment reference');
    }
    const identity: CodeEnvironmentIdentity =
      ref.kind === 'skill'
        ? { kind: ref.kind, id: ref.id, version: ref.version }
        : { kind: ref.kind, id: ref.id };
    const { getDownloadStream } = dependencies.getCodeEnvironmentDownloadStrategy();
    if (!getDownloadStream) {
      throw new Error('Attached execute_code file cannot be downloaded');
    }
    return (await getDownloadStream(`${ref.storage_session_id}/${ref.file_id}`, identity, req)).data;
  }

  if (dependencies.checkOpenAIStorage(attachment.source)) {
    if (!attachment.model) {
      throw new Error(`Attached file source "${String(attachment.source)}" has no associated model`);
    }
    const endpointMap: Partial<Record<FileSources, EModelEndpoint>> = {
      [FileSources.openai]: EModelEndpoint.assistants,
      [FileSources.azure]: EModelEndpoint.azureAssistants,
    };
    const providerReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req, {
      body: { ...req.body, model: attachment.model },
    }) as ServerRequest;
    const { openai } = await dependencies.getOpenAIClient({
      req: providerReq,
      res,
      overrideEndpoint: endpointMap[attachment.source] ?? EModelEndpoint.assistants,
    });
    const response = await openai.files.content(attachment.file_id);
    return response.body && typeof (response.body as ReadableStream<Uint8Array>).getReader === 'function'
      ? dependencies.readableFromWeb(response.body)
      : (response.body as AttachmentUploadStream);
  }
  const { getDownloadStream } = dependencies.getStorageDownloadStrategy(attachment.source);
  if (!getDownloadStream) {
    throw new Error(`Attached file source "${attachment.source}" cannot be downloaded`);
  }
  return getDownloadStream(req, attachment.storageKey || attachment.filepath);
}

/** Resolves an authorized attachment reference to base64 tool arguments. */
export async function resolveAttachmentUpload({
  toolArguments,
  requestBody,
  user,
  dependencies,
}: {
  toolArguments: unknown;
  requestBody?: AttachmentUploadRequestBody;
  user?: { id?: string };
  dependencies: AttachmentUploadDependencies;
}): Promise<JsonObject> {
  if (!isObject(toolArguments)) {
    throw new Error('Attachment upload arguments must be an object');
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
    (requestBody?.files ?? [])
      .map((file) => file.file_id),
  );
  const sourceFileReference = sourceFileId ?? sourceFile;
  const matchingAttachments = hasSourceFileId || (hasSourceFile && requestFileIds.has(sourceFile))
    ? requestFileIds.has(sourceFileReference as string)
      ? (await dependencies.getFiles({ file_id: sourceFileReference, user: user?.id }, null, { text: 0 })) ?? []
      : []
    : (await dependencies.getFiles(
        {
          conversationId: requestBody?.conversationId,
          user: user?.id,
          context: 'execute_code',
          filename: sourceFileName ?? sourceFile,
          'metadata.codeEnvRef': { $exists: true },
        },
        null,
        { text: 0 },
      )) ?? [];
  if (matchingAttachments.length !== 1) {
    throw new Error('Attachment source must identify a file available to the current user');
  }

  const stream = await dependencies.getAttachmentDownloadStream(matchingAttachments[0]);
  try {
    const {
      sourceFileId: _sourceFileId,
      sourceFileName: _sourceFileName,
      sourceFile: _sourceFile,
      ...uploadArguments
    } = toolArguments;
    return { ...uploadArguments, content: await readStreamAsBase64(stream), encoding: 'base64' };
  } finally {
    if (typeof stream.destroy === 'function' && !stream.destroyed) {
      stream.destroy();
    }
  }
}

/** Rewrites an authorized tool schema to accept attachment references instead of bytes. */
export function addAttachmentUploadHints(
  schema: JsonObject | null,
  toolName: string,
  serverConfig: AttachmentUploadServerConfig | undefined,
  requestBody: AttachmentUploadRequestBody | undefined,
  isGoogle = false,
): JsonObject | null {
  if (!schema || !supportsAttachmentUpload(serverConfig, toolName)) {
    return schema;
  }

  const attachments = requestBody?.files?.filter((file) => typeof file?.file_id === 'string') ?? [];
  const required = (Array.isArray(schema.required) ? schema.required : []).filter(
    (property) => property !== 'content' && property !== 'sourceFileId' && property !== 'sourceFileName',
  );
  const properties = isObject(schema.properties) ? schema.properties : {};
  const { content: _content, ...uploadProperties } = properties;
  const uploadSchema = {
    ...schema,
    properties: {
      ...uploadProperties,
      sourceFileId: {
        type: 'string',
        description: `ID of a file attached to the current request. LibreChat resolves it to the original bytes. Current request attachments: ${attachments.map((file) => `${file.file_id} (${file.filename ?? 'attached file'})`).join(', ')}.`,
      },
      sourceFileName: {
        type: 'string',
        description:
          'Exact filename of a file created earlier in this conversation. LibreChat resolves it to the original bytes.',
      },
    },
    required,
  };
  if (isGoogle) {
    return {
      ...uploadSchema,
      properties: {
        ...uploadProperties,
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
