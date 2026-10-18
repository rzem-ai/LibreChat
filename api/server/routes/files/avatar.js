const fs = require('fs').promises;
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  generateCheckAccess,
  inspectContent,
  extractFileContent,
  hasActiveFileFieldPolicy,
  contentFilterBlockResponse,
  contentFilterUninspectableResponse,
  getBlockedUninspectableFileField,
  getAssistantVisibility,
} = require('@librechat/api');
const { PermissionTypes, Permissions, PermissionBits } = require('librechat-data-provider');
const { getAssistant, getRoleByName } = require('~/models');
// Deloitte Custom Change: agent avatar access control (PR #1204, serve private Azure agent avatars).
const { canAccessAgentResource } = require('~/server/middleware');
const validateAuthor = require('~/server/middleware/assistants/validateAuthor');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { resizeAvatar } = require('~/server/services/Files/images/avatar');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { filterFile } = require('~/server/services/Files/process');
// Deloitte Custom Change: stream private Azure Blob avatar files through the authenticated API.
const { getAzureFileStream } = require('~/server/services/Files/Azure/crud');

const router = express.Router();
const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const authorizeAgentAvatar = canAccessAgentResource({
  requiredPermission: PermissionBits.VIEW,
  resourceIdParam: 'agent_id',
});

const avatarPathPattern =
  /^images\/([a-f\d]{24})\/(?:avatar-(?:\d+|[a-f\d-]{36})|agent-([^/]+)-avatar-\d+|assistant-([^-]+)-([^/]+)-avatar-[a-f\d-]{36})\.(png|gif|jpe?g|webp)$/i;

// Deloitte Custom Change: authorize private Azure assistant avatars before streaming their blobs.
const authorizeAssistantAvatar = async (req, res, next) => {
  const { endpoint, assistant_id } = req.params;
  const assistant = await getAssistant({
    assistantId: assistant_id,
    avatarFilepath: `/api/files/images/avatar?file=${req.query.file}`,
  });
  if (!assistant || assistant.tenantId !== req.user.tenantId || assistant.endpoint !== endpoint) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const assistantsConfig = req.config.endpoints?.[endpoint];
  if (!assistantsConfig) {
    return next();
  }

  const visibility = getAssistantVisibility({
    assistantId: assistant_id,
    authorId: String(assistant.user),
    userId: req.user.id,
    config: assistantsConfig,
  });
  if (visibility === 'author') {
    try {
      await validateAuthor({
        req,
        assistantDoc: assistant,
        overrideEndpoint: endpoint,
        overrideAssistantId: assistant_id,
        getOpenAI: async () => {
          const { openai } = await getOpenAIClient({ req, res, overrideEndpoint: endpoint });
          return openai;
        },
      });
      return next();
    } catch {
      return res.status(403).json({ message: 'Access denied' });
    }
  }
  if (visibility === 'denied') {
    return res.status(403).json({ message: 'Assistant not supported' });
  }

  return next();
};

const validateAvatarPath = (req, res, next) => {
  const encodedPath = req.query.file;
  if (typeof encodedPath !== 'string') {
    return res.status(400).json({ message: 'Avatar file is required' });
  }

  const blobPath = Buffer.from(encodedPath, 'base64url').toString();
  const match = avatarPathPattern.exec(blobPath);
  if (!match) {
    return res.status(400).json({ message: 'Invalid avatar file' });
  }

  const [, ownerId, agentId, endpoint, assistantId] = match;
  req.avatarBlobPath = blobPath;
  if (agentId) {
    req.params.agent_id = agentId;
    return checkAgentAccess(req, res, () => authorizeAgentAvatar(req, res, next));
  }

  if (assistantId) {
    req.params.endpoint = endpoint;
    req.params.assistant_id = assistantId;
    return authorizeAssistantAvatar(req, res, next);
  }

  if (ownerId !== req.user.id) {
    return res.status(403).json({ message: 'Access denied' });
  }
  return next();
};

// Deloitte Custom Change: browsers cannot read avatars directly from private Azure containers.
router.get('/', validateAvatarPath, async (req, res) => {
  const blobPath = req.avatarBlobPath;
  try {
    const stream = await getAzureFileStream(
      req,
      `/${process.env.AZURE_CONTAINER_NAME ?? 'files'}/${blobPath}`,
    );
    res.type(blobPath.slice(blobPath.lastIndexOf('.') + 1));
    stream.on('error', (error) => {
      logger.error('[/files/images/avatar] Error streaming profile picture', error);
      if (!res.headersSent) {
        res.status(500);
      }
      res.end();
    });
    return stream.pipe(res);
  } catch (error) {
    logger.error('[/files/images/avatar] Error retrieving profile picture', error);
    return res.status(404).json({ message: 'Profile picture not found' });
  }
});

router.post('/', async (req, res) => {
  try {
    const appConfig = req.config;
    filterFile({ req, file: req.file, image: true, isAvatar: true });
    if (hasActiveFileFieldPolicy(req.config?.filters, ['name', 'content'])) {
      const finding = inspectContent(extractFileContent({ name: req.file.originalname }), {
        filters: req.config.filters,
      });
      if (finding != null) {
        return res.status(400).json(contentFilterBlockResponse(finding));
      }
      const uninspectableField = getBlockedUninspectableFileField(req.config.filters, ['content']);
      if (uninspectableField != null) {
        return res.status(400).json(contentFilterUninspectableResponse(uninspectableField));
      }
    }

    const userId = req.user.id;
    const { manual } = req.body;
    const input = await fs.readFile(req.file.path);

    if (!userId) {
      throw new Error('User ID is undefined');
    }

    const fileStrategy = getFileStrategy(appConfig, { isAvatar: true });
    const desiredFormat = appConfig.imageOutputType;
    const resizedBuffer = await resizeAvatar({
      userId,
      input,
      desiredFormat,
    });

    const { processAvatar } = getStrategyFunctions(fileStrategy);
    const url = await processAvatar({
      buffer: resizedBuffer,
      userId,
      manual,
      tenantId: req.user.tenantId,
    });

    res.json({ url });
  } catch (error) {
    const message = 'An error occurred while uploading the profile picture';
    logger.error(message, error);
    res.status(500).json({ message });
  } finally {
    try {
      await fs.unlink(req.file.path);
      logger.debug('[/files/images/avatar] Temp. image upload file deleted');
    } catch {
      logger.debug('[/files/images/avatar] Temp. image upload file already deleted');
    }
  }
});

module.exports = router;
