const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { getAssistant } = require('~/models');

/**
 * Checks if the assistant is supported or excluded
 * @param {object} params
 * @param {object} params.req - Express Request
 * @param {object} params.req.body - The request payload.
 * @param {object} [params.assistantDoc] - The stored assistant document, if already loaded.
 * @param {string} params.overrideEndpoint - The override endpoint
 * @param {string} params.overrideAssistantId - The override assistant ID
 * @param {OpenAIClient} [params.openai] - OpenAI API Client
 * @param {() => Promise<OpenAIClient>} [params.getOpenAI] - Lazily initializes the OpenAI API Client.
 * @returns {Promise<void>}
 */
const validateAuthor = async ({
  req,
  openai,
  getOpenAI,
  assistantDoc,
  overrideEndpoint,
  overrideAssistantId,
}) => {
  const endpoint = overrideEndpoint ?? req.body.endpoint ?? req.query.endpoint;
  const assistant_id =
    overrideAssistantId ?? req.params.id ?? req.body.assistant_id ?? req.query.assistant_id;

  const appConfig = req.config;
  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = appConfig.endpoints?.[endpoint];
  if (!assistantsConfig) {
    return;
  }

  if (!assistantsConfig.privateAssistants) {
    return;
  }

  let canManageAssistants = false;
  try {
    canManageAssistants = await hasCapability(req.user, SystemCapabilities.MANAGE_ASSISTANTS);
  } catch (err) {
    logger.warn(`[validateAuthor] capability check failed, denying bypass: ${err.message}`);
  }

  if (canManageAssistants) {
    logger.debug(`[validateAuthor] MANAGE_ASSISTANTS bypass for user ${req.user.id}`);
    return;
  }

  // Deloitte Custom Change: reuse the avatar route's loaded assistant before initializing its provider.
  const storedAssistant =
    assistantDoc ?? (await getAssistant({ assistantId: assistant_id, user: req.user.id }));
  if (storedAssistant && String(storedAssistant.user) === req.user.id) {
    return;
  }
  const client = openai ?? (getOpenAI ? await getOpenAI() : undefined);
  if (!client) {
    throw new Error('OpenAI client is required to validate assistant ownership.');
  }
  const assistant = await client.beta.assistants.retrieve(assistant_id);
  if (req.user.id !== assistant?.metadata?.author) {
    throw new Error(`Assistant ${assistant_id} is not authored by the user.`);
  }
};

module.exports = validateAuthor;
