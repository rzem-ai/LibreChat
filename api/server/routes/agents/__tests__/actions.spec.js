/**
 * Tests for the agent actions endpoint
 *
 * Deloitte Custom Change: Tests server-side gate for createActions feature flag.
 */

const express = require('express');
const request = require('supertest');

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  generateCheckAccess: jest.fn(() => (req, res, next) => next()),
  planAgentActionUpdate: jest.fn(),
  isActionDomainAllowed: jest.fn().mockResolvedValue(true),
  legacyActionDomainEncode: jest.fn().mockReturnValue('encoded-domain'),
  validateActionOAuthMetadata: jest.fn().mockResolvedValue(undefined),
  ACTION_CREDENTIAL_REFRESH_MESSAGE: 'credential refresh required',
  buildActionOAuthTokenDeleteQueries: jest.fn().mockReturnValue([]),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  removeNullishValues: jest.fn((val) => val),
  validateActionDomain: jest.fn().mockReturnValue({ isValid: true }),
  validateAndParseOpenAPISpec: jest.fn(),
}));

jest.mock('~/server/services/ActionService', () => ({
  encryptMetadata: jest.fn(async (val) => val),
  domainParser: jest.fn().mockResolvedValue('example.com'),
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/server/services/Agents/ownerContact', () => ({
  attachOwnerContacts: jest.fn(async (_, agents) => agents),
}));

jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  getAgent: jest.fn(),
  getActions: jest.fn().mockResolvedValue([]),
  deleteTokens: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  canAccessAgentResource: jest.fn(() => (req, res, next) => next()),
}));

jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'test-action-id') }));

const actionsRouter = require('../actions');

function buildApp(configOverrides = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 'user-123', role: 'USER' };
    req.config = configOverrides;
    next();
  });
  app.use('/actions', actionsRouter);
  return app;
}

describe('POST /actions/:agent_id – createActions feature flag', () => {
  it('returns 403 when createActions is false', async () => {
    const app = buildApp({
      interface: {
        customDeloitteFeatureFlags: {
          createActions: false,
        },
      },
    });

    const res = await request(app)
      .post('/actions/agent-1')
      .send({ functions: [{ name: 'fn' }], metadata: { domain: 'example.com' } });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Action creation is disabled');
  });

  it('does not block when createActions is true', async () => {
    const { getAgent } = require('~/models');
    getAgent.mockResolvedValue({
      id: 'agent-1',
      actions: [],
      tools: [],
      author: 'user-123',
    });

    const { planAgentActionUpdate } = require('@librechat/api');
    planAgentActionUpdate.mockReturnValue({
      requiresCredentialRefresh: false,
      deleteOAuthTokens: false,
      metadata: { domain: 'example.com', auth: {} },
      action: { action_id: 'test-action-id' },
      agentTools: [],
    });

    const db = require('~/models');
    db.updateAction = jest.fn().mockResolvedValue({ action_id: 'test-action-id' });
    db.updateAgent = jest.fn().mockResolvedValue({ id: 'agent-1' });

    const app = buildApp({
      interface: {
        customDeloitteFeatureFlags: {
          createActions: true,
        },
      },
    });

    const res = await request(app)
      .post('/actions/agent-1')
      .send({ functions: [{ name: 'fn' }], metadata: { domain: 'example.com' } });

    expect(res.status).not.toBe(403);
  });

  it('does not block when createActions flag is absent', async () => {
    const app = buildApp({});

    const res = await request(app)
      .post('/actions/agent-1')
      .send({ functions: [{ name: 'fn' }], metadata: { domain: 'example.com' } });

    expect(res.status).not.toBe(403);
  });
});
