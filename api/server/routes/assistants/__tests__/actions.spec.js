const express = require('express');
const request = require('supertest');

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isActionDomainAllowed: jest.fn(),
  validateActionOAuthMetadata: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  removeNullishValues: jest.fn((value) => value),
}));

jest.mock('~/server/services/ActionService', () => ({
  legacyDomainEncode: jest.fn(),
  encryptMetadata: jest.fn(),
  domainParser: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/models', () => ({}));

// Deloitte Custom Change: disable custom Actions when customDeloitteFeatureFlags.createActions is false.
jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  configMiddleware: (req, res, next) => next(),
  rejectDisabledActions: jest.requireActual('~/server/middleware/rejectDisabledActions')
    .rejectDisabledActions,
}));

const { v1 } = require('../v1');
const v2 = require('../v2');

function buildApp(config, router, route) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.config = config;
    req.user = { id: 'user-123' };
    next();
  });
  app.use(route, router);
  return app;
}

describe('POST /actions/:assistant_id - createActions feature flag', () => {
  // Deloitte Custom Change: disable custom Actions when customDeloitteFeatureFlags.createActions is false.
  it.each([
    ['v1', v1, '/assistants/v1'],
    ['v2', v2, '/assistants/v2'],
  ])(
    'returns 403 through the Assistant %s action route when createActions is false',
    async (_, router, route) => {
      const app = buildApp(
        {
          config: {
            interface: {
              customDeloitteFeatureFlags: {
                createActions: false,
              },
            },
          },
        },
        router,
        route,
      );

      const response = await request(app).post(`${route}/actions/assistant-1`).send({});

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Action creation is disabled');
    },
  );

  it('does not disable creation when the flag is absent', async () => {
    // Deloitte Custom Change: disable custom Actions when customDeloitteFeatureFlags.createActions is false.
    const response = await request(buildApp({}, v1, '/assistants/v1'))
      .post('/assistants/v1/actions/assistant-1')
      .send({ functions: [] });

    // Deloitte Custom Change: disable custom Actions when customDeloitteFeatureFlags.createActions is false.
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('No functions provided');
  });
});
