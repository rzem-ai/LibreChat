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

  const routes = [
    ['post', '/api/api-keys', 201],
    ['get', '/api/api-keys', 200],
    ['get', '/api/api-keys/key-1', 200],
    ['delete', '/api/api-keys/key-1', 204],
  ];

  // Deloitte Custom Change: verifies that every API key lifecycle route remains administrator-only.
  it.each(routes)(
    'allows an administrator to access %s %s',
    async (method, path, expectedStatus) => {
      const app = createApp();

      const response = await request(app)[method](path).set('x-user-role', 'ADMIN');

      expect(response.status).toBe(expectedStatus);
    },
  );

  it.each(routes)(
    'denies a non-administrator before a handler runs: %s %s',
    async (method, path) => {
      const app = createApp();

      const response = await request(app)[method](path).set('x-user-role', 'USER');

      expect(response.status).toBe(403);
    },
  );

  it('does not invoke any handler for a non-administrator', async () => {
    const app = createApp();

    await request(app).get('/api/api-keys').set('x-user-role', 'USER').expect(403);

    expect(mockHandlers.createApiKey).not.toHaveBeenCalled();
    expect(mockHandlers.listApiKeys).not.toHaveBeenCalled();
    expect(mockHandlers.getApiKey).not.toHaveBeenCalled();
    expect(mockHandlers.deleteApiKey).not.toHaveBeenCalled();
  });
});
