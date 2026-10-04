import type { IMongoFile } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import { PassThrough, Readable } from 'node:stream';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import {
  getAttachmentDownloadStream,
  readStreamAsBase64,
  resolveAttachmentUpload,
} from './attachmentUpload';

const MAX_ATTACHMENT_UPLOAD_BYTES = 7 * 1024 * 1024;
const attachment = {
  file_id: 'file-1',
  source: FileSources.local,
  filepath: '/uploads/file-1',
} as IMongoFile & { source: FileSources };

describe('MCP attachment uploads', () => {
  it('encodes a stream exactly at the 7MB upload limit', async () => {
    const bytes = Buffer.alloc(MAX_ATTACHMENT_UPLOAD_BYTES, 'a');

    await expect(readStreamAsBase64(Readable.from([bytes]))).resolves.toBe(bytes.toString('base64'));
  });

  it('rejects and destroys a stream larger than the 7MB upload limit', async () => {
    const stream = new PassThrough({ autoDestroy: false });
    const destroy = jest.spyOn(stream, 'destroy');
    stream.end(Buffer.alloc(MAX_ATTACHMENT_UPLOAD_BYTES + 1));

    await expect(
      resolveAttachmentUpload({
        toolArguments: { sourceFileId: 'file-1' },
        requestBody: { files: [{ file_id: 'file-1' }] },
        user: { id: 'user-1' },
        dependencies: {
          getFiles: jest.fn().mockResolvedValue([attachment]),
          getCodeGeneratedFiles: jest.fn(),
          getAttachmentDownloadStream: jest.fn().mockResolvedValue(stream),
        },
      }),
    ).rejects.toThrow('Attachment exceeds the 7MB upload limit');

    expect(destroy).toHaveBeenCalled();
    expect(stream.destroyed).toBe(true);
  });

  it('normalizes Axios-style storage download responses to readable streams', async () => {
    const stream = Readable.from([Buffer.from('attachment bytes')]);
    const getDownloadStream = jest.fn().mockResolvedValue({ data: stream });

    const download = await getAttachmentDownloadStream({
      attachment,
      req: {} as ServerRequest,
      res: {} as Response,
      dependencies: {
        getStorageDownloadStrategy: jest.fn().mockReturnValue({ getDownloadStream }),
        getCodeEnvironmentDownloadStrategy: jest.fn(),
        checkOpenAIStorage: jest.fn().mockReturnValue(false),
        getOpenAIClient: jest.fn(),
        readableFromWeb: jest.fn(),
      },
    });

    expect(download).toBe(stream);
    await expect(readStreamAsBase64(download)).resolves.toBe(
      Buffer.from('attachment bytes').toString('base64'),
    );
  });
});
