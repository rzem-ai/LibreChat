const fs = require('fs').promises;
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { generateCheckAccess } = require('@librechat/api');
const { PermissionTypes, Permissions, PermissionBits } = require('librechat-data-provider');
const { getRoleByName } = require('~/models');
const { canAccessAgentResource } = require('~/server/middleware');
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
  /^images\/([a-f\d]{24})\/(?:avatar-\d+|agent-([^/]+)-avatar-\d+)\.(png|gif)$/i;

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

  const [, ownerId, agentId] = match;
  req.avatarBlobPath = blobPath;
  if (agentId) {
    req.params.agent_id = agentId;
    return checkAgentAccess(req, res, () => authorizeAgentAvatar(req, res, next));
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
    res.type(blobPath.endsWith('.gif') ? 'gif' : 'png');
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
