import { isDeepStrictEqual } from 'node:util';
import type { Readable } from 'node:stream';
import { getNonNegativeIntegerEnv } from './connection';

const DEFAULT_ATTACHMENT_UPLOAD_MAX_BYTES = 7 * 1024 * 1024; //7MB, set as base, in case env variable is not set.

/** Override via `MCP_ATTACHMENT_UPLOAD_MAX_BYTES`; read per-call so tests/ops changes apply immediately. */
function getAttachmentUploadMaxBytes(): number {
  return getNonNegativeIntegerEnv(
    'MCP_ATTACHMENT_UPLOAD_MAX_BYTES',
    DEFAULT_ATTACHMENT_UPLOAD_MAX_BYTES,
  );
}

type Attachment = {
  file_id?: string;
  filename?: string;
};

type RequestBodyWithFiles = {
  files?: Attachment[];
};

type JsonSchema = {
  required?: string[];
  properties?: Record<string, unknown>;
  allOf?: unknown[];
  [key: string]: unknown;
};

type AttachmentUploadSchema = {
  required?: string[];
  properties?: Record<string, unknown>;
  allOf?: unknown[];
  unevaluatedProperties?: unknown;
};

/**
 * Deloitte Custom Change: strict providers reject root allOf schemas, so retain only equivalent
 * intersections and reject every unrepresentable schema rather than broadening a tool contract.
 */
const minimumKeywords = new Set([
  'minimum',
  'exclusiveMinimum',
  'minLength',
  'minItems',
  'minProperties',
]);
const maximumKeywords = new Set([
  'maximum',
  'exclusiveMaximum',
  'maxLength',
  'maxItems',
  'maxProperties',
]);

/** Deloitte Custom Change: distinguish object-schema members from boolean and scalar allOf members. */
function isJsonSchema(value: unknown): value is JsonSchema {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Deloitte Custom Change: retain prototype-named JSON Schema properties as own fields. */
function setSchemaProperty(schema: JsonSchema, key: string, value: unknown): void {
  Object.defineProperty(schema, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/** Deloitte Custom Change: merge only JSON Schema constraints with a representable intersection. */
function mergeSchemaConstraint(key: string, left: unknown, right: unknown): unknown | undefined {
  if (isDeepStrictEqual(left, right)) {
    return left;
  }
  if (
    key === 'required' &&
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.every((value) => typeof value === 'string') &&
    right.every((value) => typeof value === 'string')
  ) {
    return Array.from(new Set([...left, ...right]));
  }
  if (key === 'properties' && isJsonSchema(left) && isJsonSchema(right)) {
    return mergeSchemaProperties(left, right);
  }
  if (key === 'type') {
    let leftTypes: unknown[] | undefined;
    if (typeof left === 'string') {
      leftTypes = [left];
    } else if (Array.isArray(left)) {
      leftTypes = left;
    }
    let rightTypes: unknown[] | undefined;
    if (typeof right === 'string') {
      rightTypes = [right];
    } else if (Array.isArray(right)) {
      rightTypes = right;
    }
    if (
      leftTypes?.every((type) => typeof type === 'string') &&
      rightTypes?.every((type) => typeof type === 'string')
    ) {
      const types = new Set<string>();
      for (const leftType of leftTypes) {
        for (const rightType of rightTypes) {
          if (leftType === rightType) {
            types.add(leftType);
          } else if (
            (leftType === 'number' && rightType === 'integer') ||
            (leftType === 'integer' && rightType === 'number')
          ) {
            types.add('integer');
          }
        }
      }
      if (types.has('number')) {
        types.delete('integer');
      }
      const intersectedTypes = Array.from(types);
      if (intersectedTypes.length === 0) {
        return undefined;
      }
      return intersectedTypes.length === 1 ? intersectedTypes[0] : intersectedTypes;
    }
  }
  if (key === 'enum' && Array.isArray(left) && Array.isArray(right)) {
    const values = left.filter((value) =>
      right.some((candidate) => isDeepStrictEqual(value, candidate)),
    );
    return values.length === 0 ? undefined : values;
  }
  if (minimumKeywords.has(key) && typeof left === 'number' && typeof right === 'number') {
    return Math.max(left, right);
  }
  if (maximumKeywords.has(key) && typeof left === 'number' && typeof right === 'number') {
    return Math.min(left, right);
  }
}

/** Deloitte Custom Change: return undefined when an allOf intersection cannot be represented safely. */
function mergeSchemaNode(left: JsonSchema, right: JsonSchema): JsonSchema | undefined {
  if (!canMergeClosedObjectSchemas(left, right)) {
    return undefined;
  }
  const result: JsonSchema = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (key === 'allOf') {
      return undefined;
    }
    if (!hasOwn(result, key)) {
      setSchemaProperty(result, key, value);
      continue;
    }
    const merged = mergeSchemaConstraint(key, result[key], value);
    if (merged === undefined) {
      return undefined;
    }
    setSchemaProperty(result, key, merged);
  }
  return result;
}

/** Deloitte Custom Change: closed object schemas are rejected unless flattening preserves every branch. */
function canMergeClosedObjectSchemas(left: JsonSchema, right: JsonSchema): boolean {
  const leftProperties = isJsonSchema(left.properties) ? left.properties : {};
  const rightProperties = isJsonSchema(right.properties) ? right.properties : {};
  if (left.additionalProperties !== undefined && left.additionalProperties !== true) {
    for (const key of Object.keys(rightProperties)) {
      if (!hasOwn(leftProperties, key)) {
        return false;
      }
    }
  }
  if (right.additionalProperties !== undefined && right.additionalProperties !== true) {
    for (const key of Object.keys(leftProperties)) {
      if (!hasOwn(rightProperties, key)) {
        return false;
      }
    }
  }
  return true;
}

/** Deloitte Custom Change: merge property maps while retaining all overlapping constraints. */
function mergeSchemaProperties(left: JsonSchema, right: JsonSchema): JsonSchema | undefined {
  const result: JsonSchema = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (!hasOwn(result, key)) {
      setSchemaProperty(result, key, value);
      continue;
    }
    if (!isJsonSchema(result[key]) || !isJsonSchema(value)) {
      return undefined;
    }
    const merged = mergeSchemaNode(result[key], value);
    if (merged === undefined) {
      return undefined;
    }
    setSchemaProperty(result, key, merged);
  }
  return result;
}

/**
 * Deloitte Custom Change: Only explicitly trusted MCP tools may receive attachment bytes.
 * Determines whether an admin-configured MCP server may receive attachment bytes for a tool.
 */
export function supportsAttachmentUpload(
  serverConfig: { source?: string; dbId?: unknown; attachmentUploadTools?: string[] } | undefined,
  toolName: string,
): boolean {
  return (
    serverConfig != null &&
    (serverConfig.source != null ? serverConfig.source !== 'user' : !serverConfig.dbId) &&
    Array.isArray(serverConfig.attachmentUploadTools) &&
    serverConfig.attachmentUploadTools.includes(toolName)
  );
}

export function getAttachmentSourceField(
  requestBody: RequestBodyWithFiles | undefined,
): 'sourceFileId' | 'sourceFileName' {
  return requestBody?.files?.some((file) => typeof file?.file_id === 'string')
    ? 'sourceFileId'
    : 'sourceFileName';
}

/**
 * Deloitte Custom Change: Flatten root allOf members before strict providers reject them,
 * preserving tool arguments declared in their properties and required lists.
 */
function mergeRootAllOf<TSchema extends AttachmentUploadSchema>(
  schema: TSchema,
  isRoot = true,
): TSchema | undefined {
  if (!isRoot && hasOwn(schema, 'unevaluatedProperties') && schema.unevaluatedProperties !== true) {
    return undefined;
  }
  if (!hasOwn(schema, 'allOf')) {
    return schema;
  }

  if (!Array.isArray(schema.allOf)) {
    return undefined;
  }
  let result: JsonSchema = { ...schema };
  delete result.allOf;
  for (const member of schema.allOf) {
    if (member === true) {
      continue;
    }
    if (member === false || !isJsonSchema(member)) {
      return undefined;
    }
    const flattenedMember = mergeRootAllOf(member, false);
    if (flattenedMember == null) {
      return undefined;
    }
    const merged = mergeSchemaNode(result, flattenedMember);
    if (merged == null) {
      return undefined;
    }
    result = merged;
  }
  return result as TSchema;
}

/**
 * Deloitte Custom Change: Encode attachment bytes locally so the language model never relays them.
 * Reads an authorized stream while retaining only base64 output in memory.
 */
export async function readStreamAsBase64(stream: Readable, signal?: AbortSignal): Promise<string> {
  const maxBytes = getAttachmentUploadMaxBytes();
  const encodedChunks: string[] = [];
  let remainder = Buffer.alloc(0);
  let size = 0;
  const abort = () => stream.destroy();

  if (signal?.aborted) {
    abort();
    throw signal.reason ?? new Error('Attachment upload aborted');
  }
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error('Attachment upload aborted');
      }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) {
        throw new Error(`Attachment exceeds the ${maxBytes / (1024 * 1024)}MB upload limit`);
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
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

type AttachmentUploadDependencies<TAttachment> = {
  getRequestAttachment: (fileId: string) => Promise<TAttachment[]>;
  getThreadFiles: () => Promise<TAttachment[]>;
  getDownloadStream: (attachment: TAttachment) => Promise<Readable>;
};

type ResolveAttachmentUploadParams<TAttachment> = {
  toolArguments: Record<string, unknown> | string;
  dependencies: AttachmentUploadDependencies<TAttachment>;
  signal?: AbortSignal;
};

/**
 * Deloitte Custom Change: Resolve only files attached to the active request (or generated
 * earlier in the active thread) before tool dispatch, so the model never handles file bytes.
 * Resolves a model-provided attachment reference immediately before MCP dispatch.
 */
export async function resolveAttachmentUpload<TAttachment extends Attachment>({
  toolArguments,
  dependencies,
  signal,
}: ResolveAttachmentUploadParams<TAttachment>): Promise<Record<string, unknown> | string> {
  if (toolArguments == null || typeof toolArguments !== 'object' || Array.isArray(toolArguments)) {
    return toolArguments;
  }

  const hasSourceFileId = hasOwn(toolArguments, 'sourceFileId');
  const hasSourceFileName = hasOwn(toolArguments, 'sourceFileName');
  const hasSourceFile = hasOwn(toolArguments, 'sourceFile');
  if (Number(hasSourceFileId) + Number(hasSourceFileName) + Number(hasSourceFile) !== 1) {
    throw new Error('Specify exactly one attachment source reference');
  }

  const sourceFileId = toolArguments.sourceFileId;
  const sourceFileName = toolArguments.sourceFileName;
  const sourceFile = toolArguments.sourceFile;
  for (const [field, value] of [
    ['sourceFileId', sourceFileId],
    ['sourceFileName', sourceFileName],
    ['sourceFile', sourceFile],
  ] as const) {
    if (hasOwn(toolArguments, field) && (typeof value !== 'string' || value.trim() === '')) {
      throw new Error(`${field} must be a non-empty string`);
    }
  }

  const attachmentId = typeof sourceFileId === 'string' ? sourceFileId : sourceFile;
  let matchingAttachments: TAttachment[];
  if (hasSourceFileId) {
    matchingAttachments = await dependencies.getRequestAttachment(attachmentId as string);
  } else if (hasSourceFile) {
    // Gemini has one field for both current attachment IDs and generated-file names.
    matchingAttachments = await dependencies.getRequestAttachment(attachmentId as string);
    if (matchingAttachments.length === 0) {
      matchingAttachments = (await dependencies.getThreadFiles()).filter(
        (file) => file.filename === sourceFile,
      );
    }
  } else {
    matchingAttachments = (await dependencies.getThreadFiles()).filter(
      (file) => file.filename === sourceFileName,
    );
  }
  // Deloitte Custom Change: retain authorization while giving the model a safe recovery path.
  if (matchingAttachments.length === 0) {
    if (hasSourceFileId) {
      throw new Error(
        'This file is not available for this upload. Attach it to this message, then try again.',
      );
    }
    if (hasSourceFileName) {
      throw new Error(
        'The generated file is unavailable. Ensure this conversation is available and the file was created successfully, then try the upload again.',
      );
    }
    throw new Error(
      'The requested file could not be found. Attach it to this message or create it again, then try the upload.',
    );
  }
  // Deloitte Custom Change: never select an arbitrary artifact when names collide.
  if (matchingAttachments.length > 1) {
    throw new Error(
      'More than one file matches this name. Attach the file you want to upload, then try again.',
    );
  }

  const stream = await dependencies.getDownloadStream(matchingAttachments[0]);
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new Error('Attached file source did not return a readable stream');
  }
  try {
    const {
      sourceFileId: _sourceFileId,
      sourceFileName: _sourceFileName,
      sourceFile: _sourceFile,
      ...args
    } = toolArguments;
    return { ...args, content: await readStreamAsBase64(stream, signal), encoding: 'base64' };
  } finally {
    if (!stream.destroyed) {
      stream.destroy();
    }
  }
}

/** Adds model-facing attachment references to an already provider-normalized schema. */
export function rewriteAttachmentUploadSchema<TSchema extends AttachmentUploadSchema>(
  schema: TSchema,
  files: Attachment[] | undefined,
  isGoogle = false,
): TSchema {
  const attachments = files?.filter((file) => typeof file.file_id === 'string') ?? [];
  const mergedSchema = mergeRootAllOf(schema);
  if (mergedSchema == null) {
    // Deloitte Custom Change: do not expose a broader upload schema when strict providers reject allOf.
    throw new Error('Attachment upload schema has incompatible allOf constraints');
  }
  const required = (mergedSchema.required ?? []).filter(
    (property) =>
      !['content', 'encoding', 'sourceFile', 'sourceFileId', 'sourceFileName'].includes(property),
  );
  // Deloitte Custom Change: prevent the model from streaming file bytes through the tool call.
  const { content: _content, encoding: _encoding, ...properties } = mergedSchema.properties ?? {};
  const uploadSchema = {
    ...mergedSchema,
    properties: {
      ...properties,
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
  // Deloitte Custom Change: OpenAI-style strict function schemas reject
  // oneOf/anyOf/allOf at the schema root, so "exactly one of sourceFileId or
  // sourceFileName" is enforced at runtime (resolveAttachmentUpload) instead.
  return uploadSchema;
}

/**
 * Deloitte Custom Change: Give approved upload tools the active request's attachment IDs.
 * Adds current-request attachment identifiers to an authorized upload tool schema.
 */
export function addAttachmentUploadHints(
  schema: JsonSchema | null,
  toolName: string,
  serverConfig: { source?: string; dbId?: unknown; attachmentUploadTools?: string[] } | undefined,
  requestBody: RequestBodyWithFiles | undefined,
  isGoogle = false,
): JsonSchema | null {
  if (!schema || !supportsAttachmentUpload(serverConfig, toolName)) {
    return schema;
  }
  return rewriteAttachmentUploadSchema(schema, requestBody?.files, isGoogle);
}
