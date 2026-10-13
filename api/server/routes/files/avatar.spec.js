// Deloitte Custom Change: verifies authenticated delivery and authorization of avatars from private Azure storage.
const express = require('express');
const request = require('supertest');
const { Readable } = require('stream');

jest.mock('@librechat/data-schemas', () => ({ logger: { error: jest.fn(), debug: jest.fn() } }));
jest.mock('@librechat/api', () => ({
  generateCheckAccess: jest.fn(() => (req, res, next) => {
    if (req.get('x-agent-access') !== 'allowed') {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    return next();
  }),
  getAssistantVisibility: jest.fn(),
}));
jest.mock('~/models', () => ({ getAssistant: jest.fn(), getRoleByName: jest.fn() }));
jest.mock('~/server/middleware', () => ({
  canAccessAgentResource: jest.fn(() => (_req, _res, next) => next()),
}));
jest.mock('~/server/middleware/assistants/validateAuthor', () => jest.fn());
jest.mock('~/server/controllers/assistants/helpers', () => ({ getOpenAIClient: jest.fn() }));
jest.mock('~/server/services/Files/strategies', () => ({ getStrategyFunctions: jest.fn() }));
jest.mock('~/server/services/Files/images/avatar', () => ({ resizeAvatar: jest.fn() }));
jest.mock('~/server/utils/getFileStrategy', () => ({ getFileStrategy: jest.fn() }));
jest.mock('~/server/services/Files/process', () => ({ filterFile: jest.fn() }));
jest.mock('~/server/services/Files/Azure/crud', () => ({ getAzureFileStream: jest.fn() }));

const { getAzureFileStream } = require('~/server/services/Files/Azure/crud');
const { getAssistant } = require('~/models');
const { getAssistantVisibility } = require('@librechat/api');
const validateAuthor = require('~/server/middleware/assistants/validateAuthor');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const avatar = require('./avatar');

const USER_ID = '507f1f77bcf86cd799439011';

describe('GET /api/files/images/avatar', () => {
  const app = express();
  let assistantsConfig;

  beforeAll(() => {
    app.use((req, _res, next) => {
      req.user = { id: USER_ID, tenantId: 'tenant-1' };
      req.config = { endpoints: { assistants: assistantsConfig } };
      next();
    });
    app.use('/api/files/images/avatar', avatar);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getAssistantVisibility.mockReturnValue('allowed');
    assistantsConfig = {};
    getAssistant.mockResolvedValue({ tenantId: 'tenant-1', endpoint: 'assistants', user: USER_ID });
  });

  it('streams an agent avatar when the user has agent access', async () => {
    getAzureFileStream.mockResolvedValue(Readable.from(Buffer.from('avatar')));
    const blobPath = `images/${USER_ID}/agent-agent-1-avatar-1.png`;
    const file = Buffer.from(blobPath).toString('base64url');

    const response = await request(app)
      .get(`/api/files/images/avatar?file=${file}`)
      .set('x-agent-access', 'allowed');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^image\/png/);
    expect(response.body.toString()).toBe('avatar');
    expect(getAzureFileStream).toHaveBeenCalledWith(expect.any(Object), '/files/' + blobPath);
  });

  it('streams a private assistant avatar for an allowed assistant', async () => {
    getAzureFileStream.mockResolvedValue(Readable.from(Buffer.from('avatar')));
    const blobPath = `images/${USER_ID}/assistant-assistants-asst_123-avatar-550e8400-e29b-41d4-a716-446655440000.webp`;
    const file = Buffer.from(blobPath).toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^image\/webp/);
    expect(response.body.toString()).toBe('avatar');
    expect(getAzureFileStream).toHaveBeenCalledWith(expect.any(Object), '/files/' + blobPath);
  });

  it('allows an assistant author when private assistants are enabled', async () => {
    getAssistantVisibility.mockReturnValue('author');
    assistantsConfig = {
      privateAssistants: true,
      supportedIds: ['asst_other'],
      excludedIds: ['asst_123'],
    };
    validateAuthor.mockResolvedValue();
    getAzureFileStream.mockResolvedValue(Readable.from(Buffer.from('avatar')));
    const blobPath = `images/${USER_ID}/assistant-assistants-asst_123-avatar-550e8400-e29b-41d4-a716-446655440000.webp`;
    const file = Buffer.from(blobPath).toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(200);
    expect(validateAuthor).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideEndpoint: 'assistants',
        overrideAssistantId: 'asst_123',
        getOpenAI: expect.any(Function),
      }),
    );
    expect(getOpenAIClient).not.toHaveBeenCalled();
  });

  it('prioritizes supported assistants over excluded assistants', async () => {
    assistantsConfig = { supportedIds: ['asst_123'], excludedIds: ['asst_123'] };
    getAzureFileStream.mockResolvedValue(Readable.from(Buffer.from('avatar')));
    const blobPath = `images/${USER_ID}/assistant-assistants-asst_123-avatar-550e8400-e29b-41d4-a716-446655440000.webp`;
    const file = Buffer.from(blobPath).toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(200);
  });

  it('rejects assistant avatars from another tenant', async () => {
    getAssistant.mockResolvedValue({ tenantId: 'tenant-2', user: USER_ID });
    const blobPath = `images/${USER_ID}/assistant-assistants-asst_123-avatar-550e8400-e29b-41d4-a716-446655440000.webp`;
    const file = Buffer.from(blobPath).toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Access denied' });
    expect(validateAuthor).not.toHaveBeenCalled();
    expect(getAzureFileStream).not.toHaveBeenCalled();
  });

  it('rejects an assistant avatar when its stored endpoint differs from the proxy path', async () => {
    getAssistant.mockResolvedValue({
      tenantId: 'tenant-1',
      endpoint: 'azureAssistants',
      user: USER_ID,
    });
    const blobPath = `images/${USER_ID}/assistant-assistants-asst_123-avatar-550e8400-e29b-41d4-a716-446655440000.webp`;
    const file = Buffer.from(blobPath).toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Access denied' });
    expect(getAzureFileStream).not.toHaveBeenCalled();
  });

  it('rejects an agent avatar when the user lacks agent access', async () => {
    const blobPath = `images/${USER_ID}/agent-agent_1-avatar-1.png`;
    const file = Buffer.from(blobPath).toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Forbidden: Insufficient permissions' });
    expect(getAzureFileStream).not.toHaveBeenCalled();
  });

  it('rejects paths outside the avatar storage prefix', async () => {
    const file = Buffer.from(`images/${USER_ID}/file-1.png`).toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid avatar file' });
    expect(getAzureFileStream).not.toHaveBeenCalled();
  });

  it('returns not found when Azure cannot provide the avatar', async () => {
    getAzureFileStream.mockRejectedValue(new Error('Blob not found'));
    const file = Buffer.from(`images/${USER_ID}/avatar-1.png`).toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Profile picture not found' });
  });

  it('only allows the owner to access a user avatar', async () => {
    const file = Buffer.from('images/507f191e810c19729de860ea/avatar-1.png').toString('base64url');

    const response = await request(app).get(`/api/files/images/avatar?file=${file}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Access denied' });
    expect(getAzureFileStream).not.toHaveBeenCalled();
  });
});
