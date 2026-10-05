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
};

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

/** Reads an authorized stream while retaining only base64 output in memory. */
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

/** Resolves a model-provided attachment reference immediately before MCP dispatch. */
export async function resolveAttachmentUpload<TAttachment extends Attachment>({
  toolArguments,
  dependencies,
  signal,
}: ResolveAttachmentUploadParams<TAttachment>): Promise<Record<string, unknown> | string> {
  if (toolArguments == null || typeof toolArguments !== 'object' || Array.isArray(toolArguments)) {
    return toolArguments;
  }

  const hasSourceFileId = Object.hasOwn(toolArguments, 'sourceFileId');
  const hasSourceFileName = Object.hasOwn(toolArguments, 'sourceFileName');
  const hasSourceFile = Object.hasOwn(toolArguments, 'sourceFile');
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
    if (Object.hasOwn(toolArguments, field) && (typeof value !== 'string' || value.trim() === '')) {
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
  if (matchingAttachments.length !== 1) {
    throw new Error('Attachment source must identify a file available to the current user');
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
  const required = (schema.required ?? []).filter(
    (property) => !['content', 'encoding', 'sourceFileId', 'sourceFileName'].includes(property),
  );
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
