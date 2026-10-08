import crypto from 'node:crypto';
import { Tools } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { UIResource } from 'librechat-data-provider';
import type * as t from './types';

export const DEFAULT_MCP_IMAGE_DATA_MAX_BYTES: number = 10 * 1024 * 1024;

/** Marker URI scheme for legacy MCP file-download artifacts. */
export const CODE_FILE_DOWNLOAD_SCHEME = 'librechat-download://';

function generateResourceId(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 10);
}

function getMCPImageDataMaxBytes(): number {
  const raw = process.env.MCP_IMAGE_DATA_MAX_BYTES;
  if (!raw) {
    return DEFAULT_MCP_IMAGE_DATA_MAX_BYTES;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MCP_IMAGE_DATA_MAX_BYTES;
}

function getBase64Padding(data: string): number {
  if (data.endsWith('==')) {
    return 2;
  }
  if (data.endsWith('=')) {
    return 1;
  }
  return 0;
}

function estimateBase64ImageBytes(data: string): number {
  const padding = getBase64Padding(data);
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

function isRemoteImageUrl(data: string): boolean {
  return data.startsWith('http://') || data.startsWith('https://');
}

function assertImageDataWithinLimit(item: t.ImageContent): void {
  if (isRemoteImageUrl(item.data)) {
    return;
  }

  const maxBytes = getMCPImageDataMaxBytes();
  const estimatedBytes = estimateBase64ImageBytes(item.data);
  if (estimatedBytes <= maxBytes) {
    return;
  }

  throw new Error(
    `MCP image result exceeds maximum size of ${maxBytes} bytes: ${estimatedBytes} bytes`,
  );
}

const RECOGNIZED_PROVIDERS = new Set([
  'google',
  'anthropic',
  'openai',
  'azureopenai',
  'openrouter',
  'xai',
  'deepseek',
  'ollama',
  'bedrock',
]);

const imageFormatters: Record<string, undefined | t.ImageFormatter> = {
  // google: (item) => ({
  //   type: 'image',
  //   inlineData: {
  //     mimeType: item.mimeType,
  //     data: item.data,
  //   },
  // }),
  // anthropic: (item) => ({
  //   type: 'image',
  //   source: {
  //     type: 'base64',
  //     media_type: item.mimeType,
  //     data: item.data,
  //   },
  // }),
  default: (item) => ({
    type: 'image_url',
    image_url: {
      url: isRemoteImageUrl(item.data) ? item.data : `data:${item.mimeType};base64,${item.data}`,
    },
  }),
};

function isImageContent(item: t.ToolContentPart): item is t.ImageContent {
  return item.type === 'image';
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Reads the body an MCP server embedded in a resource result. A server may deliver the same file
 * either as `text` or, under the very same schema, as a base64 `blob`, so both halves are unwrapped
 * here — reading only `text` leaves a blob-delivered file as bare URI and MIME type metadata.
 *
 * Image blobs become artifacts, matching standalone image content. Binary blobs are summarized
 * rather than emitted, so they never reach the model as base64. A NUL byte marks a payload binary
 * on its own, the way git classifies a file: NUL is valid UTF-8, so decoding alone would pass a
 * compiled binary through as text.
 */
function readResourceBody(resource: t.ResourceContents): t.ResourceBody {
  if ('text' in resource && typeof resource.text === 'string' && resource.text) {
    return { text: resource.text };
  }
  if (!('blob' in resource) || typeof resource.blob !== 'string' || !resource.blob) {
    return {};
  }

  const mimeType = resource.mimeType;
  if (mimeType != null && mimeType.toLowerCase().startsWith('image/')) {
    return { image: { type: 'image', data: resource.blob, mimeType } };
  }

  const bytes = Buffer.from(resource.blob, 'base64');
  if (bytes.includes(0)) {
    return { binaryBytes: bytes.byteLength };
  }
  try {
    const text = utf8Decoder.decode(bytes);
    return text ? { text } : {};
  } catch {
    return { binaryBytes: bytes.byteLength };
  }
}

const LINE_BREAKS = /[\r\n\u2028\u2029]+/g;

/**
 * Resource metadata renders as a single labeled line, so a line break inside one lets whoever
 * controls it — a hostile server, or merely whoever named a file the server relays — close the
 * line early and forge further labels, passing attacker text off as another field. Only these
 * one-line fields are flattened; resource bodies keep their line breaks, being the payload.
 */
function flattenMetadata(value: string): string {
  return value.replace(LINE_BREAKS, ' ');
}

function describeBinaryResource(bytes: number): string {
  return `Resource Content: ${bytes} bytes of binary data (omitted; not UTF-8 text)`;
}

function describeResourceLink(item: t.ResourceLink): string[] {
  const lines: string[] = [];
  if (item.name) {
    lines.push(`Resource Name: ${flattenMetadata(item.name)}`);
  }
  if (item.title) {
    lines.push(`Resource Title: ${flattenMetadata(item.title)}`);
  }
  if (item.description) {
    lines.push(`Resource Description: ${flattenMetadata(item.description)}`);
  }
  if (item.uri) {
    lines.push(`Resource URI: ${flattenMetadata(item.uri)}`);
  }
  if (item.mimeType) {
    lines.push(`Resource MIME Type: ${flattenMetadata(item.mimeType)}`);
  }
  if (typeof item.size === 'number') {
    lines.push(`Resource Size: ${item.size} bytes`);
  }
  return lines;
}

/**
 * Deloitte Custom Change: validates the trusted gateway's short-lived download contract.
 * The origin, expiry, and declared size must be safe before creating an artifact.
 */
function parseSharePointGatewayDownload(
  text: string,
  gatewayOrigin: string | undefined,
): NonNullable<t.Artifacts>['codeFile'] | undefined {
  try {
    const payload: unknown = JSON.parse(text);
    if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
      return undefined;
    }
    const { status, fileName, mimeType, downloadUrl, size, expiresAt } = payload as {
      status?: unknown;
      fileName?: unknown;
      mimeType?: unknown;
      downloadUrl?: unknown;
      size?: unknown;
      expiresAt?: unknown;
    };
    if (
      status !== 'ready' ||
      typeof fileName !== 'string' ||
      !fileName ||
      typeof mimeType !== 'string' ||
      !mimeType ||
      typeof downloadUrl !== 'string' ||
      !gatewayOrigin ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      typeof expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()
    ) {
      return undefined;
    }
    let origin: string;
    try {
      origin = new URL(downloadUrl).origin;
    } catch {
      return undefined;
    }
    if (origin !== gatewayOrigin) {
      return undefined;
    }
    return { name: fileName, mimeType, url: downloadUrl, gatewayDownload: true, size, expiresAt };
  } catch {
    return undefined;
  }
}

function removeGatewaySensitiveFields(payload: unknown): void {
  if (Array.isArray(payload)) {
    for (const [index, value] of payload.entries()) {
      if (typeof value === 'string') {
        payload[index] = value.replace(/https?:\/\/[^\s"'<>]+/giu, '[redacted URL]');
      } else {
        removeGatewaySensitiveFields(value);
      }
    }
    return;
  }
  if (payload == null || typeof payload !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'downloadUrl' || key === 'fileName') {
      delete (payload as Record<string, unknown>)[key];
    } else if (typeof value === 'string') {
      (payload as Record<string, unknown>)[key] = value.replace(
        /https?:\/\/[^\s"'<>]+/giu,
        '[redacted URL]',
      );
    } else {
      removeGatewaySensitiveFields(value);
    }
  }
}

/** Deloitte Custom Change: removes gateway grants and untrusted filenames from rejected trusted responses. */
function redactSharePointGatewayDownloadUrl(text: string): string {
  try {
    const payload: unknown = JSON.parse(text);
    if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
      // Deloitte Custom Change: trusted gateway primitives and arrays are opaque because they may be grants.
      return 'Gateway download response could not be processed.';
    }
    removeGatewaySensitiveFields(payload);
    return JSON.stringify(payload);
  } catch {
    // Deloitte Custom Change: malformed trusted gateway responses are opaque so escaped keys cannot leak grants.
    return 'Gateway download response could not be processed.';
  }
}

/**
 * Deloitte Custom Change: removes trusted gateway download grants before they reach model context.
 * Successful readiness responses become transient Code Interpreter artifacts; errors retain redacted text.
 */
function extractTrustedSharePointAttachment(
  content: t.ToolContentPart[],
  extractSharePointAttachment = true,
  gatewayOrigin?: string,
  allowArtifact = true,
): {
  codeFile?: NonNullable<t.Artifacts>['codeFile'];
  content: t.ToolContentPart[];
} {
  let codeFile: NonNullable<t.Artifacts>['codeFile'];
  const remaining: t.ToolContentPart[] = [];

  for (const item of content) {
    if (
      item.type === 'resource' &&
      item.resource.uri.toLowerCase().startsWith(CODE_FILE_DOWNLOAD_SCHEME) &&
      'text' in item.resource &&
      item.resource.text
    ) {
      if (extractSharePointAttachment) {
        // The trusted gateway must use its metadata-bearing response so MCP.js can enforce its admission policy.
        continue;
      }
      if (!codeFile) {
        const { uri, mimeType, text } = item.resource;
        const rawName = uri.slice(CODE_FILE_DOWNLOAD_SCHEME.length) || uri;
        let name = rawName;
        try {
          name = decodeURIComponent(rawName);
        } catch {
          // Preserve legacy producer behavior for malformed percent-encoded filenames.
        }
        codeFile = { name, mimeType, url: text };
      } else {
        // Consume every marker so a second signed URL cannot enter model context.
        logger.warn(
          `[MCP][parsers] Dropped a second librechat-download:// marker (only one codeFile per tool result is supported): ${item.resource.uri}`,
        );
      }
      continue;
    }
    if (extractSharePointAttachment && item.type === 'text') {
      const gatewayDownload = parseSharePointGatewayDownload(item.text, gatewayOrigin);
      if (gatewayDownload && allowArtifact) {
        codeFile ??= gatewayDownload;
        continue;
      }
      remaining.push({ ...item, text: redactSharePointGatewayDownloadUrl(item.text) });
      continue;
    }
    remaining.push(item);
  }

  if (!codeFile) {
    return { codeFile, content: remaining };
  }

  // Deloitte Custom Change: a paired code-file artifact allows gateway-local paths to be hidden from the model.
  return {
    codeFile,
    content: remaining.map((item) => {
      if (item.type !== 'text') {
        return item;
      }
      try {
        const payload: unknown = JSON.parse(item.text);
        if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
          return item;
        }
        if (!Object.hasOwn(payload, 'tempPath')) {
          return item;
        }
        delete (payload as { tempPath?: unknown }).tempPath;
        return { ...item, text: JSON.stringify(payload) };
      } catch {
        return item;
      }
    }),
  };
}

function parseAsString(content: t.ToolContentPart[]): string {
  if (!content.length) {
    return '(No response)';
  }

  const text = content
    .map((item) => {
      if (item.type === 'text') {
        return item.text;
      }
      if (item.type === 'resource_link') {
        return describeResourceLink(item).join('\n');
      }
      if (item.type === 'resource') {
        const resourceText = [];
        const body = readResourceBody(item.resource);
        if (body.text) {
          resourceText.push(body.text);
        } else if (body.image) {
          assertImageDataWithinLimit(body.image);
          resourceText.push(`data:${body.image.mimeType};base64,${body.image.data}`);
        } else if (body.binaryBytes != null) {
          resourceText.push(describeBinaryResource(body.binaryBytes));
        }
        if (item.resource.uri) {
          resourceText.push(`Resource URI: ${flattenMetadata(item.resource.uri)}`);
        }
        if (item.resource.mimeType != null && item.resource.mimeType) {
          resourceText.push(`Type: ${flattenMetadata(item.resource.mimeType)}`);
        }
        return resourceText.join('\n');
      }
      if (isImageContent(item)) {
        assertImageDataWithinLimit(item);
      }
      return JSON.stringify(item, null, 2);
    })
    .filter(Boolean)
    .join('\n\n');

  return text;
}

/**
 * Converts MCPToolCallResponse content into a plain-text string plus optional artifacts
 * (images, UI resources). All providers receive string content; images are separated into
 * artifacts and merged back by the agents package via formatArtifactPayload / formatAnthropicArtifactContent.
 *
 * @param provider - Used only to distinguish recognized vs. unrecognized providers.
 * All recognized providers currently produce identical string output;
 * provider-specific artifact merging is delegated to the agents package.
 */
export function formatToolContent(
  result: t.MCPToolCallResponse,
  provider: t.Provider,
  extractSharePointAttachment = false,
  gatewayOrigin?: string,
): t.FormattedContentResult {
  const { codeFile: extractedCodeFile, content } = extractTrustedSharePointAttachment(
    result?.content ?? [],
    extractSharePointAttachment,
    gatewayOrigin,
    !result?.isError,
  );
  const codeFile = extractedCodeFile;

  if (!RECOGNIZED_PROVIDERS.has(provider)) {
    let text = '(No response)';
    if (content.length > 0) {
      text = parseAsString(content);
    } else if (codeFile) {
      text = '';
    }
    return [text, codeFile ? { codeFile } : undefined];
  }

  if (!content.length) {
    return codeFile ? ['', { codeFile }] : ['(No response)', undefined];
  }

  const imageUrls: t.FormattedContent[] = [];
  const uiResources: UIResource[] = [];
  let currentTextBlock = '';

  type ContentHandler = undefined | ((item: t.ToolContentPart) => void);

  const collectImage = (item: t.ImageContent): void => {
    assertImageDataWithinLimit(item);
    const formatter = imageFormatters.default as t.ImageFormatter;
    const formattedImage = formatter(item);
    if (formattedImage.type === 'image_url') {
      imageUrls.push(formattedImage);
    }
  };

  const contentHandlers: {
    text: (item: Extract<t.ToolContentPart, { type: 'text' }>) => void;
    image: (item: t.ToolContentPart) => void;
    resource: (item: Extract<t.ToolContentPart, { type: 'resource' }>) => void;
    resource_link: (item: t.ResourceLink) => void;
  } = {
    text: (item) => {
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + item.text;
    },

    image: (item) => {
      if (!isImageContent(item)) {
        return;
      }
      collectImage(item);
    },

    resource: (item) => {
      const isUiResource = item.resource.uri.startsWith('ui://');
      const resourceText: string[] = [];

      if (isUiResource) {
        const contentToHash =
          'text' in item.resource && item.resource.text && typeof item.resource.text === 'string'
            ? item.resource.text
            : item.resource.uri;
        const resourceId = generateResourceId(contentToHash);
        const uiResource: UIResource = {
          ...item.resource,
          resourceId,
        };
        uiResources.push(uiResource);
        resourceText.push(`UI Resource ID: ${resourceId}`);
        resourceText.push(`UI Resource Marker: \\ui{${resourceId}}`);
      } else {
        const body = readResourceBody(item.resource);
        if (body.text) {
          resourceText.push(`Resource Text: ${body.text}`);
        } else if (body.image) {
          collectImage(body.image);
        } else if (body.binaryBytes != null) {
          resourceText.push(describeBinaryResource(body.binaryBytes));
        }
      }

      if (item.resource.uri.length) {
        resourceText.push(`Resource URI: ${flattenMetadata(item.resource.uri)}`);
      }
      if (item.resource.mimeType != null && item.resource.mimeType) {
        resourceText.push(`Resource MIME Type: ${flattenMetadata(item.resource.mimeType)}`);
      }

      if (resourceText.length) {
        currentTextBlock += (currentTextBlock ? '\n\n' : '') + resourceText.join('\n');
      }
    },

    resource_link: (item) => {
      const lines = describeResourceLink(item);
      if (lines.length) {
        currentTextBlock += (currentTextBlock ? '\n\n' : '') + lines.join('\n');
      }
    },
  };

  for (const item of content) {
    const handler = contentHandlers[item.type as keyof typeof contentHandlers] as ContentHandler;
    if (handler) {
      handler(item as never);
    } else {
      const stringified = JSON.stringify(item, null, 2);
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + stringified;
    }
  }

  if (uiResources.length > 0) {
    const uiInstructions = `

UI Resource Markers Available:
- Each resource above includes a stable ID and a marker hint like \`\\ui{abc123}\`
- You should usually introduce what you're showing before placing the marker
- For a single resource: \\ui{resource-id}
- For multiple resources shown separately: \\ui{resource-id-a} \\ui{resource-id-b}
- For multiple resources in a carousel: \\ui{resource-id-a,resource-id-b,resource-id-c}
- The UI will be rendered inline where you place the marker
- Format: \\ui{resource-id} or \\ui{id1,id2,id3} using the IDs provided above`;

    currentTextBlock += uiInstructions;
  }

  let artifacts: t.Artifacts = undefined;
  if (imageUrls.length > 0) {
    artifacts = { content: imageUrls };
  }

  if (uiResources.length > 0) {
    artifacts = {
      ...artifacts,
      [Tools.ui_resources]: { data: uiResources },
    };
  }

  if (codeFile) {
    artifacts = { ...artifacts, codeFile };
  }

  return [currentTextBlock || (artifacts != null ? '' : '(No response)'), artifacts];
}
