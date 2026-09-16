import { Types } from 'mongoose';
import { createApiKeyHandlers } from './handlers';
import type { ApiKeyHandlerDependencies } from './handlers';

// Deloitte Custom Change: covers administrator-managed service account API key handlers.
function createResponse() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

function createDependencies(): jest.Mocked<ApiKeyHandlerDependencies> {
  return {
    createAgentApiKey: jest.fn(),
    listAgentApiKeys: jest.fn(),
    deleteAgentApiKey: jest.fn(),
    getAgentApiKeyById: jest.fn(),
    findUser: jest.fn(),
  };
}

describe('createApiKeyHandlers', () => {
  test('creates a key for the service account resolved from the supplied email', async () => {
    const serviceAccountId = new Types.ObjectId();
    const deps = createDependencies();
    deps.findUser.mockResolvedValue({ _id: serviceAccountId });
    deps.createAgentApiKey.mockResolvedValue({
      id: 'key-id',
      name: 'evals',
      key: 'sk-secret',
      keyPrefix: 'sk-secre',
      createdAt: new Date('2026-01-01'),
    });
    const handlers = createApiKeyHandlers(deps);
    const response = createResponse();

    await handlers.createApiKey(
      {
        body: { name: 'evals', userEmail: 'EVALS@EXAMPLE.COM' },
        query: {},
      } as never,
      response as never,
    );

    expect(deps.findUser).toHaveBeenCalledWith({ email: 'evals@example.com' });
    expect(deps.createAgentApiKey).toHaveBeenCalledWith({
      userId: serviceAccountId.toString(),
      name: 'evals',
      expiresAt: null,
    });
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ key: 'sk-secret' }));
  });

  test('rejects a request without a resolvable service account', async () => {
    const deps = createDependencies();
    deps.findUser.mockResolvedValue(null);
    const handlers = createApiKeyHandlers(deps);
    const response = createResponse();

    await handlers.listApiKeys(
      { body: {}, query: { userEmail: 'missing@example.com' } } as never,
      response as never,
    );

    expect(deps.listAgentApiKeys).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });
});
