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
    EModelEndpoint: { agents: 'agents' },
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

const mockGetAgent = jest.fn();
jest.mock('~/models', () => ({ getAgent: (...args) => mockGetAgent(...args) }), { virtual: true });

const { uploadVectors } = require('./crud');

describe('VectorDB upload routing', () => {
  let appendSpy;
  let readStreamSpy;

  beforeEach(() => {
    process.env.RAG_API_URL = 'http://rag-api';
    axios.post.mockResolvedValue({ data: { status: true, known_type: true } });
    appendSpy = jest.spyOn(FormData.prototype, 'append');
    readStreamSpy = jest.spyOn(fs, 'createReadStream').mockReturnValue(Readable.from(['file']));
    mockGetAgent.mockReset();
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

  it('routes an agent-backed upload to regional when the agent provider is a regional endpoint', async () => {
    mockGetAgent.mockResolvedValue({ provider: 'Azure AU' });

    await uploadVectors({
      req: {
        user: { id: 'user-1' },
        body: { endpoint: 'agents', agent_id: 'agent-123' },
        config: { endpoints: { custom: [{ name: 'Azure AU', regional: true }] } },
      },
      file: {
        path: '/tmp/file.txt',
        size: 4,
        originalname: 'file.txt',
        mimetype: 'text/plain',
      },
      file_id: 'file-1',
    });

    expect(mockGetAgent).toHaveBeenCalledWith({ id: 'agent-123' });
    expect(appendedRegion()).toBe('regional');
  });

  it('routes an agent-backed upload to global when the agent provider has no regional flag', async () => {
    mockGetAgent.mockResolvedValue({ provider: 'Azure Global' });

    await uploadVectors({
      req: {
        user: { id: 'user-1' },
        body: { endpoint: 'agents', agent_id: 'agent-456' },
        config: { endpoints: { custom: [{ name: 'Azure Global' }] } },
      },
      file: {
        path: '/tmp/file.txt',
        size: 4,
        originalname: 'file.txt',
        mimetype: 'text/plain',
      },
      file_id: 'file-1',
    });

    expect(appendedRegion()).toBe('global');
  });

  it('blocks an agent upload when no agent_id is present in the request body', async () => {
    await expect(
      uploadVectors({
        req: {
          user: { id: 'user-1' },
          body: { endpoint: 'agents' },
          config: { endpoints: {} },
        },
        file: {
          path: '/tmp/file.txt',
          size: 4,
          originalname: 'file.txt',
          mimetype: 'text/plain',
        },
        file_id: 'file-1',
      }),
    ).rejects.toThrow('File upload is not supported: no agent_id in request body.');
  });

  it('blocks an agent upload when the agent has no configured provider', async () => {
    mockGetAgent.mockResolvedValue({ provider: null });

    await expect(
      uploadVectors({
        req: {
          user: { id: 'user-1' },
          body: { endpoint: 'agents', agent_id: 'agent-789' },
          config: { endpoints: {} },
        },
        file: {
          path: '/tmp/file.txt',
          size: 4,
          originalname: 'file.txt',
          mimetype: 'text/plain',
        },
        file_id: 'file-1',
      }),
    ).rejects.toThrow('File upload is not supported: the agent has no configured provider.');
  });
});
