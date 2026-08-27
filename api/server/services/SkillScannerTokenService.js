const { logger } = require('@librechat/data-schemas');
const { exchangeOboToken } = require('./OboTokenService');

const SKILL_SCANNER_OBO_SCOPE = 'api://4aeebbdc-56f5-4329-b40e-3d0a243bf74a/access_as_user';

async function getSkillScannerToken(user, accessToken, scopes, fromCache = true) {
  try {
    return await exchangeOboToken(user, accessToken, scopes, fromCache);
  } catch (error) {
    logger.error(
      `[SkillScannerTokenService] Failed to acquire skill scanner token for user ${user.openidId}:`,
      error,
    );
    throw new Error(`Skill scanner token acquisition failed: ${error.message}`);
  }
}

/**
 * Resolves an OBO-derived skill scanner token for the given user, or `undefined` if none
 * can be obtained (e.g. non-OpenID users, or before admin consent is granted on the
 * AI Registry scope) — the scan request is then sent unauthenticated.
 */
async function resolveSkillScannerToken(user) {
  const accessToken = user?.federatedTokens?.access_token;
  if (!user?.openidId || !accessToken) {
    return undefined;
  }
  try {
    const { access_token } = await getSkillScannerToken(user, accessToken, SKILL_SCANNER_OBO_SCOPE);
    return access_token;
  } catch (error) {
    logger.warn('[resolveSkillScannerToken] OBO exchange failed', error);
    return undefined;
  }
}

module.exports = {
  getSkillScannerToken,
  resolveSkillScannerToken,
};
