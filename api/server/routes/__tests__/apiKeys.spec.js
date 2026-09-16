const express = require('express');
const request = require('supertest');

const mockHandlers = {
  createApiKey: jest.fn((req, res) => res.status(201).json({ userId: req.user.id })),
  listApiKeys: jest.fn((req, res) => res.status(200).json({ keys: [] })),
  getApiKey: jest.fn((req, res) => res.status(200).json({ id: req.params.id })),
  deleteApiKey: jest.fn((req, res) => res.status(204).end()),
};

jest.mock('@librechat/api', () => ({
  createApiKeyHandlers: jest.fn(() => mockHandlers),
}));

jest.mock('~/models', () => ({
  getAgentApiKeyById: jest.fn(),
  createAgentApiKey: jest.fn(),
  deleteAgentApiKey: jest.fn(),
  listAgentApiKeys: jest.fn(),
  findUser: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'user-1', role: req.get('x-user-role') ?? 'USER' };
    next();
  },
}));

describe('API key routes', () => {
  function createApp() {
    delete require.cache[require.resolve('../apiKeys')];
    const router = require('../apiKeys');
    const app = express();
    app.use(express.json());
    app.use('/api/api-keys', router);
    return app;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Deloitte Custom Change: verifies that API key management remains administrator-only.
  it('allows an administrator to list API keys', async () => {
    const app = createApp();

    await request(app).get('/api/api-keys').set('x-user-role', 'ADMIN').expect(200);

    expect(mockHandlers.listApiKeys).toHaveBeenCalledTimes(1);
  });

  it('denies a non-administrator before an API key handler runs', async () => {
    const app = createApp();

    await request(app).get('/api/api-keys').set('x-user-role', 'USER').expect(403);

    expect(mockHandlers.listApiKeys).not.toHaveBeenCalled();
  });
});
