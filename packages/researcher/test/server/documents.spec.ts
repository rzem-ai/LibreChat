import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpCallTool } from '../../src/server/documents';
import {
  createMcpDocumentGateway,
  documentToMarkdown,
  DocumentError,
} from '../../src/server/documents';

const SPEC =
  '# Scope\nThe system must export CSV.\n\n## Security\nAll access is logged.\n\n## Security\nSecond.';

let client: Client;
let server: McpServer;
let calls: Array<Record<string, unknown>>;

/** A stand-in for the MCP gateway's document tool, served by the real MCP SDK. */
async function startGateway() {
  calls = [];
  server = new McpServer({ name: 'gateway', version: '1.0.0' });
  server.registerTool(
    'get_document',
    {
      description: 'Fetch a SharePoint or OneDrive document',
      inputSchema: { reference: z.string() },
    },
    async ({ reference }) => {
      calls.push({ reference });
      if (reference.includes('missing')) {
        return { isError: true, content: [{ type: 'text', text: 'Item not found: secret path' }] };
      }
      if (reference.includes('plain')) {
        return { content: [{ type: 'text', text: 'Plain body without metadata.' }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              title: 'Requirements spec',
              siteId: 'site-1',
              parentReference: { driveId: 'drive-2' },
              id: 'item-3',
              webUrl: 'https://contoso.sharepoint.com/sites/x/spec.docx',
              content: SPEC,
            }),
          },
        ],
      };
    },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'librechat-test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
}

const callTool: McpCallTool = async ({ toolName, toolArguments }) =>
  (await client.callTool({ name: toolName, arguments: toolArguments })) as Awaited<
    ReturnType<McpCallTool>
  >;

beforeEach(startGateway);
afterEach(async () => {
  await client.close();
  await server.close();
});

describe('createMcpDocumentGateway', () => {
  const gateway = () =>
    createMcpDocumentGateway({
      serverName: 'gateway',
      toolName: 'get_document',
      argumentName: 'reference',
      callTool,
    });

  it('fetches a document through the gateway tool and reads its stable ids', async () => {
    const doc = await gateway().fetchDocument({ reference: 'https://contoso/sites/x/spec.docx' });
    expect(calls).toEqual([{ reference: 'https://contoso/sites/x/spec.docx' }]);
    expect(doc).toMatchObject({
      title: 'Requirements spec',
      siteId: 'site-1',
      driveId: 'drive-2',
      itemId: 'item-3',
      webUrl: 'https://contoso.sharepoint.com/sites/x/spec.docx',
      text: SPEC,
    });
  });

  it('accepts a plain text body and keys it by the reference', async () => {
    const doc = await gateway().fetchDocument({ reference: 'onedrive:/plain.txt' });
    expect(doc.text).toBe('Plain body without metadata.');
    expect(doc.itemId).toMatch(/^ref_[a-f0-9]{16}$/);
  });

  it('turns a gateway error into a coded error without its text', async () => {
    const error = await gateway()
      .fetchDocument({ reference: 'missing.docx' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect((error as DocumentError).code).toBe('document_unavailable');
    expect((error as DocumentError).message).not.toContain('secret path');
  });
});

describe('documentToMarkdown', () => {
  it('derives unique section anchors from headings and a stable reference', () => {
    const converted = documentToMarkdown({
      title: 'Spec',
      siteId: 'site-1',
      driveId: 'drive-2',
      itemId: 'item-3',
      text: SPEC,
      sections: [],
    });
    expect(converted.reference).toBe('site-1/drive-2/item-3');
    expect(converted.sections.map((s) => s.anchor)).toEqual(['scope', 'security', 'security-2']);
    expect(converted.markdown).toContain('<a id="security-2"></a>');
  });

  it('stays linear on hostile heading lines', () => {
    const hostile = `# ${' '.repeat(50_000)}#${' '.repeat(50_000)}x`;
    const started = Date.now();
    documentToMarkdown({ itemId: 'i', text: hostile });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('keeps anchors the gateway supplied', () => {
    const converted = documentToMarkdown({
      itemId: 'item-9',
      text: 'Body',
      sections: [{ anchor: 'sec-4.2', title: 'Retention' }],
    });
    expect(converted.reference).toBe('onedrive/-/item-9');
    expect(converted.sections).toEqual([{ anchor: 'sec-4.2', title: 'Retention' }]);
  });
});
