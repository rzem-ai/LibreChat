const mockGetUserById = jest.fn();
const mockUpdateUser = jest.fn();
const mockMergeTutorialRatings = jest.fn();

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
  // Use the real validateTutorialStateUpdate and MAX_TUTORIAL_RATINGS so tests
  // exercise the actual validation logic rather than a stub — consistent with
  // SkillStatesController tests which also use the real validateSkillStatesPayload.
  ...jest.requireActual('@librechat/api'),
  // Override side-effectful imports that would require a running server:
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
  mergeTutorialRatings: (...args) => mockMergeTutorialRatings(...args),
}));

const {
  getTutorialStateController,
  updateTutorialStateController,
} = require('~/server/controllers/UserController');

const { MAX_TUTORIAL_RATINGS } = require('@librechat/api');

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

    it('uses mergeTutorialRatings (atomic per-key write) instead of overwriting the whole map', async () => {
      mockGetUserById.mockResolvedValue({ tutorialRatings: { 'other-course': 5 } });
      mockMergeTutorialRatings.mockResolvedValue({
        tutorialPromptSeen: false,
        tutorialRatings: { 'other-course': 5, 'landing-page-buttons': 4 },
      });
      const req = createRequest({
        body: { tutorialRatings: { 'landing-page-buttons': 4 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      // Should call mergeTutorialRatings with only the incoming ratings (not pre-merged)
      expect(mockMergeTutorialRatings).toHaveBeenCalledWith('user-1', {
        'landing-page-buttons': 4,
      });
      // Should NOT call updateUser for the ratings write
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        tutorialPromptSeen: false,
        tutorialRatings: { 'other-course': 5, 'landing-page-buttons': 4 },
      });
    });

    it('calls updateUser for non-ratings fields alongside mergeTutorialRatings for ratings', async () => {
      mockGetUserById.mockResolvedValue({ tutorialRatings: {} });
      mockMergeTutorialRatings.mockResolvedValue({
        tutorialPromptSeen: false,
        tutorialRatings: { 'chat-basics': 5 },
      });
      mockUpdateUser.mockResolvedValue({
        tutorialPromptSeen: true,
        tutorialRatings: { 'chat-basics': 5 },
      });
      const req = createRequest({
        body: { tutorialRatings: { 'chat-basics': 5 }, tutorialPromptSeen: true },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockMergeTutorialRatings).toHaveBeenCalledWith('user-1', { 'chat-basics': 5 });
      expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { tutorialPromptSeen: true });
    });

    it('returns 400 when merged ratings would exceed the cap', async () => {
      // Existing ratings already at the cap
      const existingRatings = Object.fromEntries(
        Array.from({ length: MAX_TUTORIAL_RATINGS }, (_, i) => [`course-${i}`, 3]),
      );
      mockGetUserById.mockResolvedValue({ tutorialRatings: existingRatings });
      const req = createRequest({
        body: { tutorialRatings: { 'brand-new-course': 5 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: `tutorialRatings cannot exceed ${MAX_TUTORIAL_RATINGS} entries`,
      });
      expect(mockMergeTutorialRatings).not.toHaveBeenCalled();
    });

    it('accepts a request that updates existing keys without increasing the count', async () => {
      // Existing ratings at the cap — but the request only re-rates an existing key
      const existingRatings = Object.fromEntries(
        Array.from({ length: MAX_TUTORIAL_RATINGS }, (_, i) => [`course-${i}`, 3]),
      );
      mockGetUserById.mockResolvedValue({ tutorialRatings: existingRatings });
      mockMergeTutorialRatings.mockResolvedValue({
        tutorialPromptSeen: false,
        tutorialRatings: { ...existingRatings, 'course-0': 5 },
      });
      const req = createRequest({
        body: { tutorialRatings: { 'course-0': 5 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      // Merged count equals MAX_TUTORIAL_RATINGS (not over) — should succeed
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockMergeTutorialRatings).toHaveBeenCalledWith('user-1', { 'course-0': 5 });
    });

    it('accepts a request when merged total is exactly at the cap', async () => {
      // Existing has (cap - 1) entries; request adds 1 new key → total == cap
      const existingRatings = Object.fromEntries(
        Array.from({ length: MAX_TUTORIAL_RATINGS - 1 }, (_, i) => [`course-${i}`, 3]),
      );
      mockGetUserById.mockResolvedValue({ tutorialRatings: existingRatings });
      mockMergeTutorialRatings.mockResolvedValue({
        tutorialPromptSeen: false,
        tutorialRatings: { ...existingRatings, 'new-course': 4 },
      });
      const req = createRequest({
        body: { tutorialRatings: { 'new-course': 4 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockMergeTutorialRatings).toHaveBeenCalledWith('user-1', { 'new-course': 4 });
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
