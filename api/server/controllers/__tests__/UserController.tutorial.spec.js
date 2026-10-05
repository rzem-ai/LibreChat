const mockGetUserById = jest.fn();
const mockUpdateUser = jest.fn();
const mockMergeTutorialRatings = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getTenantId: jest.fn(),
  webSearchKeys: [],
  MAX_TUTORIAL_RATINGS: 50,
}));

jest.mock('librechat-data-provider', () => ({
  Tools: {},
  CacheKeys: { FLOWS: 'flows' },
  Constants: { mcp_delimiter: '_mcp_', mcp_prefix: 'mcp_' },
  FileSources: {},
  ResourceType: {},
  MAX_TUTORIAL_FEEDBACK_COMMENT_LENGTH: 200,
}));

jest.mock('@librechat/api', () => {
  // Import only the tutorial helpers directly from their source file to avoid
  // loading the full @librechat/api module graph, which pulls in tokens.ts.
  // tokens.ts references EModelEndpoint at module-eval time and crashes because
  // librechat-data-provider is mocked without EModelEndpoint here.
  // This matches the pattern used by deleteUser.spec.js and other sibling tests.
  const {
    validateTutorialStateUpdate,
    toTutorialStateResponse,
    MAX_TUTORIAL_RATINGS,
    MAX_RATING_KEY_LENGTH,
    MAX_TUTORIAL_FEEDBACK_COMMENT_LENGTH,
  } = jest.requireActual('../../../../packages/api/src/tutorial/tutorialState');

  return {
    validateTutorialStateUpdate,
    toTutorialStateResponse,
    MAX_TUTORIAL_RATINGS,
    MAX_RATING_KEY_LENGTH,
    MAX_TUTORIAL_FEEDBACK_COMMENT_LENGTH,
    // Side-effectful / server-runtime exports the controller imports but tests don't exercise:
    MCPOAuthHandler: {},
    MCPTokenStorage: {},
    getAppConfigOptionsFromUser: jest.fn(),
    normalizeHttpError: jest.fn((error) => error),
    extractWebSearchEnvVars: jest.fn(),
    needsRefresh: jest.fn(),
    getNewS3URL: jest.fn(),
    deleteAgentCheckpoints: jest.fn(),
    deleteAllSharedLinksWithCleanup: jest.fn(),
  };
});

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

const {
  MAX_TUTORIAL_RATINGS,
  MAX_RATING_KEY_LENGTH,
  MAX_TUTORIAL_FEEDBACK_COMMENT_LENGTH,
} = require('@librechat/api');

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

      expect(mockGetUserById).toHaveBeenCalledWith(
        'user-1',
        'tutorialPromptSeen tutorialRatings tutorialFeedback',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        tutorialPromptSeen: false,
        tutorialRatings: {},
        tutorialFeedback: {},
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
        tutorialFeedback: {},
      });
    });

    it('uses mergeTutorialRatings (atomic pipeline write) instead of overwriting the whole map', async () => {
      // mergeTutorialRatings now returns { user, capExceeded } — the pipeline
      // handles the merge and cap check atomically with no prior read needed.
      mockMergeTutorialRatings.mockResolvedValue({
        user: {
          tutorialPromptSeen: false,
          tutorialRatings: { 'other-course': 5, 'getting-started-guide': 4 },
        },
        capExceeded: false,
      });
      const req = createRequest({
        body: { tutorialRatings: { 'getting-started-guide': 4 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      // Should call mergeTutorialRatings with only the incoming ratings
      expect(mockMergeTutorialRatings).toHaveBeenCalledWith('user-1', {
        'getting-started-guide': 4,
      });
      // No separate getUserById read needed — pipeline handles the cap check
      expect(mockGetUserById).not.toHaveBeenCalled();
      // No updateUser call for the ratings write
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        tutorialPromptSeen: false,
        tutorialRatings: { 'other-course': 5, 'getting-started-guide': 4 },
        tutorialFeedback: {
          'other-course': { score: 5 },
          'getting-started-guide': { score: 4 },
        },
      });
    });

    it('persists non-ratings fields in the guarded ratings write', async () => {
      mockMergeTutorialRatings.mockResolvedValue({
        user: { tutorialPromptSeen: true, tutorialRatings: { 'chat-basics': 5 } },
        capExceeded: false,
      });
      const req = createRequest({
        body: { tutorialRatings: { 'chat-basics': 5 }, tutorialPromptSeen: true },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockMergeTutorialRatings).toHaveBeenCalledWith(
        'user-1',
        { 'chat-basics': 5 },
        { tutorialPromptSeen: true },
      );
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('stores tutorial feedback comments alongside the score', async () => {
      mockMergeTutorialRatings.mockResolvedValue({
        user: {
          tutorialPromptSeen: false,
          tutorialRatings: { 'other-course': 5, 'getting-started-guide': 4 },
          tutorialFeedback: { 'other-course': { score: 5, comment: 'Existing comment' } },
        },
        capExceeded: false,
      });
      mockUpdateUser.mockResolvedValue({
        tutorialPromptSeen: false,
        tutorialRatings: { 'other-course': 5, 'getting-started-guide': 4 },
        tutorialFeedback: {
          'other-course': { score: 5, comment: 'Existing comment' },
          'getting-started-guide': {
            score: 4,
            comment: 'Helpful tour',
            updatedAt: new Date('2026-09-21T10:00:00.000Z'),
          },
        },
      });
      const req = createRequest({
        body: {
          tutorialFeedback: {
            'getting-started-guide': {
              score: 4,
              comment: '  Helpful tour  ',
            },
          },
        },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockMergeTutorialRatings).toHaveBeenCalledWith(
        'user-1',
        {
          'getting-started-guide': 4,
        },
        {
          tutorialFeedback: {
            'getting-started-guide': {
              score: 4,
              comment: 'Helpful tour',
              updatedAt: expect.any(Date),
            },
          },
        },
      );
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        tutorialPromptSeen: false,
        tutorialRatings: { 'other-course': 5, 'getting-started-guide': 4 },
        tutorialFeedback: {
          'other-course': { score: 5, comment: 'Existing comment' },
          'getting-started-guide': {
            score: 4,
            comment: 'Helpful tour',
            updatedAt: new Date('2026-09-21T10:00:00.000Z'),
          },
        },
      });
    });

    it('returns 400 when the pipeline signals cap exceeded', async () => {
      // The pipeline sets capExceeded=true and leaves tutorialRatings unchanged;
      // no separate getUserById read is needed since the cap is enforced atomically.
      mockMergeTutorialRatings.mockResolvedValue({
        user: { tutorialPromptSeen: false, tutorialRatings: {} },
        capExceeded: true,
      });
      const req = createRequest({
        body: { tutorialRatings: { 'brand-new-course': 5 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockMergeTutorialRatings).toHaveBeenCalledWith('user-1', { 'brand-new-course': 5 });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: `tutorialRatings cannot exceed ${MAX_TUTORIAL_RATINGS} entries`,
      });
    });

    it('returns 409 when mergeTutorialRatings reports a write conflict', async () => {
      mockMergeTutorialRatings.mockResolvedValue({
        user: { tutorialPromptSeen: false, tutorialRatings: {} },
        capExceeded: false,
        conflict: true,
      });
      const req = createRequest({
        body: { tutorialRatings: { 'brand-new-course': 5 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'tutorialRatings update conflict, please retry',
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('returns 400 when a rating key exceeds MAX_RATING_KEY_LENGTH characters', async () => {
      // validateTutorialStateUpdate rejects the key before reaching mergeTutorialRatings.
      const oversizedKey = 'x'.repeat(MAX_RATING_KEY_LENGTH + 1);
      const req = createRequest({ body: { tutorialRatings: { [oversizedKey]: 3 } } });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockMergeTutorialRatings).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when a tutorial feedback comment exceeds the maximum length', async () => {
      const req = createRequest({
        body: {
          tutorialFeedback: {
            'getting-started-guide': {
              score: 5,
              comment: 'x'.repeat(MAX_TUTORIAL_FEEDBACK_COMMENT_LENGTH + 1),
            },
          },
        },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockMergeTutorialRatings).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: `Comment for "getting-started-guide" cannot exceed ${MAX_TUTORIAL_FEEDBACK_COMMENT_LENGTH} characters`,
      });
    });

    it('accepts a rating key exactly at MAX_RATING_KEY_LENGTH characters', async () => {
      const maxKey = 'x'.repeat(MAX_RATING_KEY_LENGTH);
      mockMergeTutorialRatings.mockResolvedValue({
        user: { tutorialPromptSeen: false, tutorialRatings: { [maxKey]: 3 } },
        capExceeded: false,
      });
      const req = createRequest({ body: { tutorialRatings: { [maxKey]: 3 } } });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(mockMergeTutorialRatings).toHaveBeenCalledWith('user-1', { [maxKey]: 3 });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('succeeds when updating an existing key does not increase the stored count', async () => {
      // Re-rating an already-stored course: merged count stays the same, no cap exceeded.
      mockMergeTutorialRatings.mockResolvedValue({
        user: { tutorialPromptSeen: false, tutorialRatings: { 'course-0': 5 } },
        capExceeded: false,
      });
      const req = createRequest({
        body: { tutorialRatings: { 'course-0': 5 } },
      });
      const res = createResponse();

      await updateTutorialStateController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockMergeTutorialRatings).toHaveBeenCalledWith('user-1', { 'course-0': 5 });
    });

    it('succeeds when merged total is exactly at the cap', async () => {
      // (cap - 1) existing + 1 new = cap exactly → pipeline does not set capExceeded.
      mockMergeTutorialRatings.mockResolvedValue({
        user: { tutorialPromptSeen: false, tutorialRatings: { 'new-course': 4 } },
        capExceeded: false,
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
