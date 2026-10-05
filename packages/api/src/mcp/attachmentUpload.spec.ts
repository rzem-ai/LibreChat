import { Readable } from 'node:stream';
import {
  readStreamAsBase64,
  resolveAttachmentUpload,
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
});
