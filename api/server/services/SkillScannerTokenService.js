const { logger } = require('@librechat/data-schemas');
const { exchangeOboToken } = require('./OboTokenService');

function getSkillScannerOboScope() {
  return `api://${process.env.AI_REGISTRY_CLIENT_ID}/access_as_user`;
}

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
    const { access_token } = await getSkillScannerToken(
      user,
      accessToken,
      getSkillScannerOboScope(),
    );
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
