// Deloitte Custom Change: verifies authenticated delivery of avatars from private Azure storage.
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
}));
jest.mock('~/models', () => ({ getRoleByName: jest.fn() }));
jest.mock('~/server/middleware', () => ({
  canAccessAgentResource: jest.fn(() => (_req, _res, next) => next()),
}));
jest.mock('~/server/services/Files/strategies', () => ({ getStrategyFunctions: jest.fn() }));
jest.mock('~/server/services/Files/images/avatar', () => ({ resizeAvatar: jest.fn() }));
jest.mock('~/server/utils/getFileStrategy', () => ({ getFileStrategy: jest.fn() }));
jest.mock('~/server/services/Files/process', () => ({ filterFile: jest.fn() }));
jest.mock('~/server/services/Files/Azure/crud', () => ({ getAzureFileStream: jest.fn() }));

const { getAzureFileStream } = require('~/server/services/Files/Azure/crud');
const avatar = require('./avatar');

const USER_ID = '507f1f77bcf86cd799439011';

describe('GET /api/files/images/avatar', () => {
  const app = express();

  beforeAll(() => {
    app.use((req, _res, next) => {
      req.user = { id: USER_ID };
      next();
    });
    app.use('/api/files/images/avatar', avatar);
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
