jest.mock('./OboTokenService');
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const { logger } = require('@librechat/data-schemas');
const { exchangeOboToken } = require('./OboTokenService');
const { getSkillScannerToken, resolveSkillScannerToken } = require('./SkillScannerTokenService');

// Set globally in test/jestSetup.js
const SKILL_SCANNER_OBO_SCOPE = `api://${process.env.AI_REGISTRY_CLIENT_ID}/access_as_user`;

describe('SkillScannerTokenService', () => {
  const mockUser = {
    openidId: 'oidc-sub-123',
    federatedTokens: { access_token: 'user-access-token' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSkillScannerToken', () => {
    it('delegates to exchangeOboToken and returns its result', async () => {
      exchangeOboToken.mockResolvedValue({ access_token: 'scanner-obo-token', expires_in: 3600 });

      const result = await getSkillScannerToken(
        mockUser,
        'user-access-token',
        SKILL_SCANNER_OBO_SCOPE,
      );

      expect(exchangeOboToken).toHaveBeenCalledWith(
        mockUser,
        'user-access-token',
        SKILL_SCANNER_OBO_SCOPE,
        true,
      );
      expect(result).toEqual({ access_token: 'scanner-obo-token', expires_in: 3600 });
    });

    it('wraps and rethrows errors from exchangeOboToken', async () => {
      exchangeOboToken.mockRejectedValue(new Error('invalid_grant'));

      await expect(
        getSkillScannerToken(mockUser, 'user-access-token', SKILL_SCANNER_OBO_SCOPE),
      ).rejects.toThrow('Skill scanner token acquisition failed: invalid_grant');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('resolveSkillScannerToken', () => {
    it('returns undefined when the user has no openidId', async () => {
      const result = await resolveSkillScannerToken({
        federatedTokens: { access_token: 'token' },
      });

      expect(result).toBeUndefined();
      expect(exchangeOboToken).not.toHaveBeenCalled();
    });

    it('returns undefined when the user has no federated access token', async () => {
      const result = await resolveSkillScannerToken({ openidId: 'oidc-sub-123' });

      expect(result).toBeUndefined();
      expect(exchangeOboToken).not.toHaveBeenCalled();
    });

    it('returns undefined for a non-OpenID user (no user object shape at all)', async () => {
      const result = await resolveSkillScannerToken(undefined);

      expect(result).toBeUndefined();
      expect(exchangeOboToken).not.toHaveBeenCalled();
    });

    it('exchanges the federated access token as the OBO assertion, not any request-supplied token', async () => {
      exchangeOboToken.mockResolvedValue({ access_token: 'scanner-obo-token', expires_in: 3600 });

      await resolveSkillScannerToken(mockUser);

      expect(exchangeOboToken).toHaveBeenCalledWith(
        mockUser,
        'user-access-token',
        SKILL_SCANNER_OBO_SCOPE,
        true,
      );
    });

    it('returns the exchanged access token on success', async () => {
      exchangeOboToken.mockResolvedValue({ access_token: 'scanner-obo-token', expires_in: 3600 });

      const result = await resolveSkillScannerToken(mockUser);

      expect(result).toBe('scanner-obo-token');
    });

    it('returns undefined (falls back to static token) when the OBO exchange fails', async () => {
      exchangeOboToken.mockRejectedValue(new Error('invalid_grant: consent required'));

      const result = await resolveSkillScannerToken(mockUser);

      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
