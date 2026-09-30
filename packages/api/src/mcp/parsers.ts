import crypto from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { Tools } from 'librechat-data-provider';
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
      if (item.type === 'resource') {
        const resourceText = [];
        if ('text' in item.resource && item.resource.text != null && item.resource.text) {
          resourceText.push(item.resource.text);
        }
        if (item.resource.uri) {
          resourceText.push(`Resource URI: ${item.resource.uri}`);
        }
        if (item.resource.mimeType != null && item.resource.mimeType) {
          resourceText.push(`Type: ${item.resource.mimeType}`);
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
    return [
      text,
      codeFile ? { codeFile } : undefined,
    ];
  }

  if (!content.length) {
    return codeFile
      ? ['', { codeFile }]
      : ['(No response)', undefined];
  }

  const imageUrls: t.FormattedContent[] = [];
  const uiResources: UIResource[] = [];
  let currentTextBlock = '';

  type ContentHandler = undefined | ((item: t.ToolContentPart) => void);

  const contentHandlers: {
    text: (item: Extract<t.ToolContentPart, { type: 'text' }>) => void;
    image: (item: t.ToolContentPart) => void;
    resource: (item: Extract<t.ToolContentPart, { type: 'resource' }>) => void;
  } = {
    text: (item) => {
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + item.text;
    },

    image: (item) => {
      if (!isImageContent(item)) {
        return;
      }
      assertImageDataWithinLimit(item);
      const formatter = imageFormatters.default as t.ImageFormatter;
      const formattedImage = formatter(item);

      if (formattedImage.type === 'image_url') {
        imageUrls.push(formattedImage);
      }
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
      } else if ('text' in item.resource && item.resource.text != null && item.resource.text) {
        resourceText.push(`Resource Text: ${item.resource.text}`);
      }

      if (item.resource.uri.length) {
        resourceText.push(`Resource URI: ${item.resource.uri}`);
      }
      if (item.resource.mimeType != null && item.resource.mimeType) {
        resourceText.push(`Resource MIME Type: ${item.resource.mimeType}`);
      }

      if (resourceText.length) {
        currentTextBlock += (currentTextBlock ? '\n\n' : '') + resourceText.join('\n');
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
