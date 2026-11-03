import { createHash } from 'node:crypto';

export type DocumentSection = { anchor: string; title: string };

export type FetchedDocument = {
  text: string;
  title?: string;
  siteId?: string;
  driveId?: string;
  itemId: string;
  webUrl?: string;
  sections: DocumentSection[];
};

/** Reads one SharePoint or OneDrive document as the user, through the MCP gateway. */
export interface DocumentGateway {
  fetchDocument(input: { reference: string; signal?: AbortSignal }): Promise<FetchedDocument>;
}

type McpContent = { type: string; text?: string };
export type McpToolResult = {
  content?: McpContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

/**
 * Calls one MCP tool for the current user. The host binds this to the live request so the
 * gateway's on-behalf-of exchange uses the user's token (design 5.9).
 */
export type McpCallTool = (input: {
  serverName: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  signal?: AbortSignal;
}) => Promise<McpToolResult>;

export type DocumentErrorCode = 'document_unavailable' | 'document_empty';

export class DocumentError extends Error {
  constructor(
    readonly code: DocumentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

type Record_ = Record<string, unknown>;

function asRecord(value: unknown): Record_ | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record_)
    : undefined;
}

function pickString(record: Record_, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function referenceId(reference: string): string {
  return `ref_${createHash('sha256').update(reference).digest('hex').slice(0, 16)}`;
}

function parseSections(value: unknown): DocumentSection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): DocumentSection[] => {
    const record = asRecord(entry);
    const anchor = record && pickString(record, 'anchor', 'id');
    const title = record && pickString(record, 'title', 'heading', 'name');
    return anchor ? [{ anchor, title: title ?? anchor }] : [];
  });
}

/**
 * The gateway's response shape is not fixed (design section 8), so the adapter reads the
 * common Graph and gateway field names from structured content or a JSON text block, and
 * falls back to treating plain text as the body keyed by the requested reference.
 */
function parseDocument(result: McpToolResult, reference: string): FetchedDocument {
  const text = (result.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n');
  let record = asRecord(result.structuredContent);
  if (!record) {
    try {
      record = asRecord(JSON.parse(text));
    } catch {
      record = undefined;
    }
  }
  if (!record) {
    return { text, itemId: referenceId(reference), sections: [] };
  }
  const parent = asRecord(record.parentReference) ?? {};
  return {
    text: pickString(record, 'content', 'text', 'body', 'markdown') ?? '',
    title: pickString(record, 'title', 'name'),
    siteId: pickString(record, 'siteId', 'site_id') ?? pickString(parent, 'siteId'),
    driveId: pickString(record, 'driveId', 'drive_id') ?? pickString(parent, 'driveId'),
    itemId: pickString(record, 'itemId', 'item_id', 'id') ?? referenceId(reference),
    webUrl: pickString(record, 'webUrl', 'web_url', 'url'),
    sections: parseSections(record.sections),
  };
}

export function createMcpDocumentGateway(deps: {
  serverName: string;
  toolName: string;
  argumentName: string;
  callTool: McpCallTool;
}): DocumentGateway {
  return {
    async fetchDocument({ reference, signal }) {
      let result: McpToolResult;
      try {
        result = await deps.callTool({
          serverName: deps.serverName,
          toolName: deps.toolName,
          toolArguments: { [deps.argumentName]: reference },
          signal,
        });
      } catch {
        throw new DocumentError('document_unavailable', 'The document could not be fetched.');
      }
      if (result.isError) {
        throw new DocumentError('document_unavailable', 'The document could not be fetched.');
      }
      const document = parseDocument(result, reference);
      if (!document.text.trim()) {
        throw new DocumentError('document_empty', 'The document has no readable text.');
      }
      return document;
    },
  };
}

/** ATX heading text without its markers; linear, with no backtracking regex. */
function headingTitle(line: string): string | undefined {
  let level = 0;
  while (level < line.length && line[level] === '#') {
    level++;
  }
  if (level === 0 || level > 6 || (line[level] !== ' ' && line[level] !== '\t')) {
    return undefined;
  }
  let end = line.length;
  while (end > level && /\s/.test(line[end - 1])) end--;
  while (end > level && line[end - 1] === '#') end--;
  const title = line.slice(level, end).trim();
  return title || undefined;
}

function slugify(title: string): string {
  return (
    title
      .slice(0, 200)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section'
  );
}

/**
 * Builds the stored snapshot body and the stable reference (site, drive and item id).
 * When the gateway supplies no anchors, each heading gets a unique slug anchor written
 * into the markdown, so a citation locator always resolves to a findable position.
 */
export function documentToMarkdown(
  doc: Omit<FetchedDocument, 'sections'> & {
    sections?: DocumentSection[];
  },
): { reference: string; markdown: string; sections: DocumentSection[] } {
  const reference = `${doc.siteId ?? 'onedrive'}/${doc.driveId ?? '-'}/${doc.itemId}`;
  if (doc.sections && doc.sections.length > 0) {
    return { reference, markdown: doc.text, sections: doc.sections };
  }
  const seen = new Map<string, number>();
  const sections: DocumentSection[] = [];
  const lines = doc.text.split('\n').map((line) => {
    const title = headingTitle(line);
    if (!title) {
      return line;
    }
    const base = slugify(title);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const anchor = count === 1 ? base : `${base}-${count}`;
    sections.push({ anchor, title });
    return `<a id="${anchor}"></a>\n${line}`;
  });
  const markdown = lines.join('\n');
  return { reference, markdown, sections };
}
