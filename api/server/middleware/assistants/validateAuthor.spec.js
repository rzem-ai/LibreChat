// Deloitte Custom Change: covers lazy provider initialization for private Azure avatar authorization.
jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), warn: jest.fn() },
  SystemCapabilities: { MANAGE_ASSISTANTS: 'MANAGE_ASSISTANTS' },
}));
jest.mock('~/server/middleware/roles/capabilities', () => ({ hasCapability: jest.fn() }));
jest.mock('~/models', () => ({ getAssistant: jest.fn() }));

const validateAuthor = require('./validateAuthor');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { getAssistant } = require('~/models');

describe('validateAuthor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not initialize a provider client when the user owns the stored assistant', async () => {
    const getOpenAI = jest.fn();
    hasCapability.mockResolvedValue(false);
    getAssistant.mockResolvedValue({ assistant_id: 'asst_123', user: 'user-1' });

    await validateAuthor({
      req: {
        user: { id: 'user-1' },
        config: { endpoints: { assistants: { privateAssistants: true } } },
      },
      overrideEndpoint: 'assistants',
      overrideAssistantId: 'asst_123',
      getOpenAI,
    });

    expect(getOpenAI).not.toHaveBeenCalled();
  });

  it('initializes a provider client only for the remote ownership fallback', async () => {
    const retrieve = jest.fn().mockResolvedValue({ metadata: { author: 'user-1' } });
    const getOpenAI = jest.fn().mockResolvedValue({ beta: { assistants: { retrieve } } });
    hasCapability.mockResolvedValue(false);
    getAssistant.mockResolvedValue(null);

    await validateAuthor({
      req: {
        user: { id: 'user-1' },
        config: { endpoints: { assistants: { privateAssistants: true } } },
      },
      overrideEndpoint: 'assistants',
      overrideAssistantId: 'asst_123',
      getOpenAI,
    });

    expect(getOpenAI).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith('asst_123');
  });
});
