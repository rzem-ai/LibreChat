import crypto from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { Tools } from 'librechat-data-provider';
import type { UIResource } from 'librechat-data-provider';
import type * as t from './types';

export const DEFAULT_MCP_IMAGE_DATA_MAX_BYTES: number = 10 * 1024 * 1024;

/**
 * Marker URI scheme a tool can use to hand back a download link for a file
 * meant for Code Interpreter, instead of a resource block a caller might
 * otherwise stringify into the model's context. `resource.text` carries the
 * actual URL; the filename lives in `resource.uri` after the scheme, percent-
 * encoded by the producer (e.g. ea-mcp-gateway's sharepoint-graph-mcp server
 * via `url.PathEscape`) since SharePoint names routinely contain spaces or
 * other characters that would otherwise be parsed as URI syntax. Consumers
 * must `decodeURIComponent` it back out.
 */
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
 * Pulls a `librechat-download://` marker resource out of the content array
 * regardless of provider, so it's never stringified into the model's
 * context even for providers outside `RECOGNIZED_PROVIDERS`.
 */
function extractCodeFile(content: t.ToolContentPart[]): {
  codeFile?: NonNullable<t.Artifacts>['codeFile'];
  content: t.ToolContentPart[];
} {
  let codeFile: NonNullable<t.Artifacts>['codeFile'];
  const remaining: t.ToolContentPart[] = [];

  for (const item of content) {
    if (
      item.type === 'resource' &&
      item.resource.uri.startsWith(CODE_FILE_DOWNLOAD_SCHEME) &&
      'text' in item.resource &&
      item.resource.text
    ) {
      // Every valid marker is consumed here (not pushed into `remaining`),
      // even beyond the first: only the first becomes the codeFile artifact,
      // but a second one left in `remaining` would have its signed download
      // URL stringified into the model's context by parseAsString below,
      // defeating the whole point of this marker scheme.
      if (!codeFile) {
        const { uri, mimeType, text } = item.resource;
        const rawName = uri.slice(CODE_FILE_DOWNLOAD_SCHEME.length) || uri;
        // Producers percent-encode the filename component (e.g. ea-mcp-gateway's
        // sharepoint-graph-mcp server) since raw names commonly contain spaces
        // or characters like '#' that would otherwise be parsed as URI syntax.
        // decodeURIComponent is a no-op for names with no such characters, so
        // this is safe even against producers that don't encode.
        let name = rawName;
        try {
          name = decodeURIComponent(rawName);
        } catch {
          // Malformed percent-encoding: fall back to the raw (undecoded) name.
        }
        codeFile = { name, mimeType, url: text };
      } else {
        /* Only the first download marker survives as a codeFile artifact;
         * a second one is dropped rather than leaked into text (see above).
         * That's silent data loss for a tool that returns multiple files in
         * one call, so at least surface it here for operators. */
        logger.warn(
          `[MCP][parsers] Dropped a second librechat-download:// marker (only one codeFile per tool result is supported): ${item.resource.uri}`,
        );
      }
      continue;
    }
    remaining.push(item);
  }

  if (!codeFile) {
    return { codeFile, content: remaining };
  }

  // Deloitte Custom Change: Hide gateway-local paths from the model once the
  // paired download marker has made the file available to Code Interpreter.
  return {
    codeFile,
    content: remaining.map((item) => {
      if (item.type !== 'text') {
        return item;
      }
      try {
        const payload = JSON.parse(item.text);
        if (payload == null || Array.isArray(payload) || !Object.hasOwn(payload, 'tempPath')) {
          return item;
        }
        delete payload.tempPath;
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
): t.FormattedContentResult {
  const { codeFile, content } = extractCodeFile(result?.content ?? []);

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
