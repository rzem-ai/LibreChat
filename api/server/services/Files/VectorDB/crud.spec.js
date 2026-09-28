const fs = require('fs');
const { Readable } = require('stream');
const axios = require('axios');
const FormData = require('form-data');

jest.mock('axios');
jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: { debug: jest.fn(), warn: jest.fn() },
  }),
  { virtual: true },
);
jest.mock(
  'librechat-data-provider',
  () => ({
    FileSources: { vectordb: 'vectordb' },
  }),
  { virtual: true },
);
jest.mock(
  '@librechat/api',
  () => ({
    generateShortLivedToken: jest.fn(() => 'file-token'),
    logAxiosError: jest.fn(),
  }),
  { virtual: true },
);

const { uploadVectors } = require('./crud');

describe('VectorDB upload routing', () => {
  let appendSpy;
  let readStreamSpy;

  beforeEach(() => {
    process.env.RAG_API_URL = 'http://rag-api';
    axios.post.mockResolvedValue({ data: { status: true, known_type: true } });
    appendSpy = jest.spyOn(FormData.prototype, 'append');
    readStreamSpy = jest.spyOn(fs, 'createReadStream').mockReturnValue(Readable.from(['file']));
  });

  afterEach(() => {
    appendSpy.mockRestore();
    readStreamSpy.mockRestore();
    delete process.env.RAG_API_URL;
  });

  const upload = (endpoint, endpoints) =>
    uploadVectors({
      req: { user: { id: 'user-1' }, body: { endpoint }, config: { endpoints } },
      file: {
        path: '/tmp/file.txt',
        size: 4,
        originalname: 'file.txt',
        mimetype: 'text/plain',
      },
      file_id: 'file-1',
    });

  const appendedRegion = () =>
    appendSpy.mock.calls.find(([name]) => name === 'embedding_region')?.[1];

  it.each([
    ['Azure Australia', 'Azure AU', { custom: [{ name: 'Azure AU', regional: true }] }],
    ['Anthropic Australia', 'bedrock', { bedrock: { regional: true } }],
  ])('routes %s to regional embeddings', async (_label, endpoint, endpoints) => {
    await upload(endpoint, endpoints);

    expect(appendedRegion()).toBe('regional');
  });

  it('routes an endpoint without the regional flag to global embeddings', async () => {
    await upload('Azure Global', {
      custom: [{ name: 'Azure Global' }],
    });

    expect(appendedRegion()).toBe('global');
  });
});
