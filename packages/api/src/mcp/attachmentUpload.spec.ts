import { Readable } from 'node:stream';
import {
  readStreamAsBase64,
  resolveAttachmentUpload,
  rewriteAttachmentUploadSchema,
  supportsAttachmentUpload,
} from './attachmentUpload';

// Deloitte Custom Change: covers the trusted-tool attachment upload pipeline
// (packages/api/src/mcp/attachmentUpload.ts), which does not exist upstream.
describe('attachment uploads', () => {
  it('only resolves generated filenames returned for the active thread', async () => {
    const inThread = { file_id: 'thread-file', filename: 'report.csv' };
    const stream = Readable.from([Buffer.from('csv')]);
    const getThreadFiles = jest.fn().mockResolvedValue([inThread]);

    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileName: 'report.csv' },
        dependencies: {
          getRequestAttachment: jest.fn(),
          getThreadFiles,
          getDownloadStream: jest.fn().mockResolvedValue(stream),
        },
      }),
    ).resolves.toEqual({ content: Buffer.from('csv').toString('base64'), encoding: 'base64' });
    expect(getThreadFiles).toHaveBeenCalledTimes(1);
  });

  it('destroys an attachment stream when its abort signal is already cancelled', async () => {
    const stream = new Readable({ read() {} });
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(readStreamAsBase64(stream, controller.signal)).rejects.toThrow('cancelled');
    expect(stream.destroyed).toBe(true);
  });

  it('reads exactly 7MiB from multiple chunks', async () => {
    const megabyte = 1024 * 1024;
    const chunks = [Buffer.alloc(3 * megabyte, 'a'), Buffer.alloc(4 * megabyte, 'b')];

    await expect(readStreamAsBase64(Readable.from(chunks))).resolves.toBe(
      Buffer.concat(chunks).toString('base64'),
    );
  });

  it('rejects a 7MiB plus one byte stream split across multiple chunks', async () => {
    const megabyte = 1024 * 1024;
    const stream = Readable.from([
      Buffer.alloc(3 * megabyte),
      Buffer.alloc(4 * megabyte),
      Buffer.alloc(1),
    ]);

    await expect(readStreamAsBase64(stream)).rejects.toThrow(
      'Attachment exceeds the 7MB upload limit',
    );
  });

  it('does not trust legacy database-backed server configs', () => {
    expect(
      supportsAttachmentUpload(
        { dbId: 'user-server', attachmentUploadTools: ['upload'] },
        'upload',
      ),
    ).toBe(false);
  });

  // Deloitte Custom Change: cover strict-provider allOf flattening without broadening tool contracts.
  it('flattens nested allOf members before rewriting an upload schema', () => {
    const schema = rewriteAttachmentUploadSchema(
      {
        properties: { content: { type: 'string' } },
        allOf: [
          {
            allOf: [
              {
                properties: { driveId: { type: 'string' } },
                required: ['driveId'],
                minProperties: 1,
              },
            ],
          },
        ],
      },
      undefined,
    );

    expect(schema).toMatchObject({
      properties: {
        driveId: { type: 'string' },
        sourceFileId: { type: 'string' },
        sourceFileName: { type: 'string' },
      },
      required: ['driveId'],
      minProperties: 1,
    });
    expect(schema).not.toHaveProperty('allOf');
  });

  // Deloitte Custom Change: an empty allOf is equivalent to true and must not reach strict providers.
  it('removes an empty root allOf before rewriting an upload schema', () => {
    const schema = rewriteAttachmentUploadSchema(
      {
        properties: { content: { type: 'string' } },
        allOf: [],
      },
      undefined,
    );

    expect(schema).not.toHaveProperty('allOf');
  });

  // Deloitte Custom Change: overlapping property constraints must retain their intersection.
  it('intersects overlapping property constraints while flattening allOf', () => {
    const schema = rewriteAttachmentUploadSchema(
      {
        properties: { driveId: { type: 'string' } },
        allOf: [
          {
            properties: { driveId: { pattern: '^[a-z]+$' } },
          },
        ],
      },
      undefined,
    );

    expect(schema.properties?.driveId).toEqual({ type: 'string', pattern: '^[a-z]+$' });
  });

  // Deloitte Custom Change: incompatible property constraints must fail closed.
  it('rejects allOf constraints that cannot be flattened without broadening them', () => {
    expect(() =>
      rewriteAttachmentUploadSchema(
        {
          properties: { driveId: { type: 'string' } },
          allOf: [
            {
              properties: { driveId: { type: 'number' } },
            },
          ],
        },
        undefined,
      ),
    ).toThrow('Attachment upload schema has incompatible allOf constraints');
  });

  // Deloitte Custom Change: JSON Schema property names must not mutate object prototypes.
  it('preserves prototype-named properties as schema fields', () => {
    const schema = rewriteAttachmentUploadSchema(
      {
        properties: { constructor: { type: 'string' } },
        allOf: [
          {
            properties: { ['__proto__']: { pattern: '^[a-z]+$' } },
          },
        ],
      },
      undefined,
    );

    const properties = schema.properties as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(properties, 'constructor')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(properties, '__proto__')).toBe(true);
    expect(properties.constructor).toEqual({ type: 'string' });
    expect(properties.__proto__).toEqual({ pattern: '^[a-z]+$' });
  });

  // Deloitte Custom Change: reject non-schema and semantically unrepresentable allOf members.
  it.each([
    { allOf: [false] },
    { allOf: [null] },
    { allOf: [42] },
    { allOf: { properties: { driveId: { type: 'string' } } } },
    { allOf: [{ allOf: [false] }] },
    {
      allOf: [{ not: { type: 'string' } }, { not: { maxLength: 5 } }],
    },
  ])('rejects unrepresentable allOf intersections: %j', (schema) => {
    expect(() => rewriteAttachmentUploadSchema(schema as { allOf?: unknown[] }, undefined)).toThrow(
      'Attachment upload schema has incompatible allOf constraints',
    );
  });

  // Deloitte Custom Change: boolean true members are identity constraints and can be removed.
  it('ignores a true allOf member while preserving its valid siblings', () => {
    const schema = rewriteAttachmentUploadSchema(
      {
        allOf: [
          true,
          {
            properties: { driveId: { type: 'string' } },
            required: ['driveId'],
          },
        ],
      },
      undefined,
    ) as { properties?: Record<string, unknown>; required?: string[] };

    expect(schema.properties?.driveId).toEqual({ type: 'string' });
    expect(schema.required).toEqual(['driveId']);
  });

  // Deloitte Custom Change: retain valid JSON Schema numeric subtype intersections.
  it('preserves integer when intersecting numeric types', () => {
    const schema = rewriteAttachmentUploadSchema(
      {
        properties: { size: { type: 'number' } },
        allOf: [
          {
            properties: { size: { type: 'integer' } },
          },
        ],
      },
      undefined,
    );

    expect(schema.properties?.size).toEqual({ type: 'integer' });
  });

  it('does not duplicate an existing Google sourceFile requirement', () => {
    const schema = rewriteAttachmentUploadSchema(
      {
        properties: { content: { type: 'string' }, sourceFile: { type: 'string' } },
        required: ['content', 'sourceFile'],
      },
      undefined,
      true,
    );

    expect(schema.required).toEqual(['sourceFile']);
  });

  // Deloitte Custom Change: reject closed-object intersections that flattening cannot preserve.
  it.each([
    {
      properties: { a: { type: 'string' } },
      additionalProperties: false,
      allOf: [{ properties: { b: { type: 'string' } } }],
    },
  ])('rejects closed object allOf intersections that cannot be flattened: %j', (schema) => {
    expect(() => rewriteAttachmentUploadSchema(schema, undefined)).toThrow(
      'Attachment upload schema has incompatible allOf constraints',
    );
  });

  // Deloitte Custom Change: schema-valued additionalProperties must constrain promoted fields.
  it('rejects additionalProperties schema intersections that cannot be flattened safely', () => {
    expect(() =>
      rewriteAttachmentUploadSchema(
        {
          additionalProperties: { type: 'string' },
          allOf: [{ properties: { driveId: { type: 'number' } } }],
        },
        undefined,
      ),
    ).toThrow('Attachment upload schema has incompatible allOf constraints');
  });

  // Deloitte Custom Change: root unevaluatedProperties retains its scope after flattening.
  it.each([
    { unevaluatedProperties: false, allOf: [{}] },
    {
      unevaluatedProperties: false,
      allOf: [{ properties: { a: { type: 'string' } } }],
    },
  ])('flattens unevaluatedProperties schemas: %j', (schema) => {
    const rewrittenSchema = rewriteAttachmentUploadSchema(schema, undefined);

    expect(rewrittenSchema).not.toHaveProperty('allOf');
    expect(rewrittenSchema.unevaluatedProperties).toBe(false);
  });

  // Deloitte Custom Change: member-local unevaluatedProperties cannot be flattened safely.
  it('rejects member-local unevaluatedProperties constraints', () => {
    expect(() =>
      rewriteAttachmentUploadSchema(
        {
          allOf: [
            {
              unevaluatedProperties: false,
              properties: { a: { type: 'string' } },
            },
          ],
        },
        undefined,
      ),
    ).toThrow('Attachment upload schema has incompatible allOf constraints');
  });

  // Deloitte Custom Change: schema-valued unevaluatedProperties must retain member-local scope.
  it('rejects member-local schema-valued unevaluatedProperties constraints', () => {
    expect(() =>
      rewriteAttachmentUploadSchema(
        {
          allOf: [
            {
              properties: { driveId: { type: 'number' } },
              unevaluatedProperties: { type: 'string' },
            },
            { properties: { folderId: { type: 'number' } } },
          ],
        },
        undefined,
      ),
    ).toThrow('Attachment upload schema has incompatible allOf constraints');
  });
});
