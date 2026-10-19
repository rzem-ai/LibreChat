// Deloitte Custom Change: Retention Update
const { purgeExpiredConversations, startConversationPurgeSweep } = require('../purgeWorker');

describe('Retention/purgeWorker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes the sweep entry points the server startup wiring calls', () => {
    expect(typeof purgeExpiredConversations).toBe('function');
    expect(typeof startConversationPurgeSweep).toBe('function');
  });

  it('disables the sweep when the interval is set to 0', () => {
    process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS = '0';
    try {
      const handle = startConversationPurgeSweep({});
      expect(handle).toBeNull();
    } finally {
      delete process.env.CONVERSATION_PURGE_SWEEP_INTERVAL_MS;
    }
  });
});
