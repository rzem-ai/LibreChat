const mockGetUserById = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getTenantId: jest.fn(),
  webSearchKeys: [],
}));

jest.mock('librechat-data-provider', () => ({
  Tools: {},
  CacheKeys: { FLOWS: 'flows' },
  Constants: { mcp_delimiter: '_mcp_', mcp_prefix: 'mcp_' },
  FileSources: {},
  ResourceType: {},
}));

jest.mock('@librechat/api', () => ({
  MCPOAuthHandler: {},
  MCPTokenStorage: {},
  getAppConfigOptionsFromUser: jest.fn(),
  normalizeHttpError: jest.fn((error) => error),
  extractWebSearchEnvVars: jest.fn(),
  needsRefresh: jest.fn(),
  getNewS3URL: jest.fn(),
  deleteAgentCheckpoints: jest.fn(),
  deleteAllSharedLinksWithCleanup: jest.fn(),
}));

jest.mock('~/server/services/PluginService', () => ({
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: jest.fn(),
}));

jest.mock('~/server/services/twoFactorService', () => ({
  verifyOTPOrBackupCode: jest.fn(),
}));

jest.mock('~/server/services/AuthService', () => ({
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getMCPServersRegistry: jest.fn(),
}));

jest.mock('~/server/services/Config/getCachedTools', () => ({
  invalidateCachedTools: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

jest.mock('~/models', () => ({
  getUserById: (...args) => mockGetUserById(...args),
  updateUser: (...args) => mockUpdateUser(...args),
}));

const {
  getTutorialStateController,
  updateTutorialStateController,
} = require('~/server/controllers/UserController');

function createResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(overrides = {}) {
  return {
    user: { id: 'user-1' },
    body: {},
    ...overrides,
  };
}

describe('UserController tutorial state', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTutorialStateController', () => {
    it('returns defaults for a user who has not interacted with the tutorial yet', async () => {
      mockGetUserById.mockResolvedValue({ tutorialPromptSeen: false, tutorialRatings: {} });
      const req = createRequest();
      const res = createResponse();

      await getTutorialStateController(req, res);

      expect(mockGetUserById).toHaveBeenCalledWith('user-1', 'tutorialPromptSeen tutorialRatings');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        tutorialPromptSeen: false,
        tutorialRatings: {},
      });
    });

    it('returns 404 when the user cannot be found', async () => {
      mockGetUserById.mockResolvedValue(null);
      const res = createResponse();

      await getTutorialStateController(createRequest(), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateTutorialStateController', () => {
    it('sets tutorialPromptSeen', async () => {
      mockUpdateUser.mockResolvedValue({ tutorialPromptSeen: true, tutorialRatings: {} });
      const req = createRequest({ body: { tutorialPromptSeen: true } });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { tutorialPromptSeen: true });
      expect(res.json).toHaveBeenCalledWith({
        tutorialPromptSeen: true,
        tutorialRatings: {},
      });
    });

    it('merges a new rating into the existing ratings map rather than overwriting it', async () => {
      mockGetUserById.mockResolvedValue({ tutorialRatings: { 'other-course': 5 } });
      mockUpdateUser.mockResolvedValue({
        tutorialPromptSeen: true,
        tutorialRatings: { 'other-course': 5, 'landing-page-buttons': 4 },
      });
      const req = createRequest({
        body: { tutorialRatings: { 'landing-page-buttons': 4 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockUpdateUser).toHaveBeenCalledWith('user-1', {
        tutorialRatings: { 'other-course': 5, 'landing-page-buttons': 4 },
      });
    });

    it('returns 404 when the user cannot be found', async () => {
      mockUpdateUser.mockResolvedValue(null);
      const res = createResponse();

      await updateTutorialStateController(
        createRequest({ body: { tutorialPromptSeen: true } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
