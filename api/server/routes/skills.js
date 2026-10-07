const path = require('path');
const multer = require('multer');
const express = require('express');
const {
  createImportHandler,
  createSkillUploadHandler,
  generateCheckAccess,
  getStorageMetadata,
  isSkillScanError,
  scanSkillFileUpload,
  resolveRequestTenantId,
  restoreTenantContextFromReq,
  handleSkillRenewRequest,
  handleSkillsExpiringSoonRequest,
} = require('@librechat/api');
const {
  logger,
  getAgentRetentionHours,
  getAgentRetentionWarningHours,
} = require('@librechat/data-schemas');
const {
  PermissionBits,
  PermissionTypes,
  Permissions,
  FileContext,
  mergeFileConfig,
} = require('librechat-data-provider');
const {
  createSkill,
  getSkillById,
  deleteSkill,
  upsertSkillFile,
  getSkillFileByPath,
  getRoleByName,
  renewSkillActivity,
  getSkillsExpiringSoon,
} = require('~/models');
const { requireJwtAuth, canAccessSkillResource } = require('~/server/middleware');
const { grantPermission } = require('~/server/services/PermissionService');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { resolveSkillScannerToken } = require('~/server/services/SkillScannerTokenService');
const { createFileLimiters } = require('~/server/middleware/limiters/uploadLimiters');
const { maybeRunGitHubSkillSyncForRequest } = require('~/server/services/Skills/sync');
const configMiddleware = require('~/server/middleware/config/app');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer: memory storage for skill imports (zip processed in-memory)
// ---------------------------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['.md', '.zip', '.skill']);
const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 MB

const memoryStorage = multer.memoryStorage();

function getSkillImportSizeLimit(req) {
  const fileConfig = mergeFileConfig(req.config?.fileConfig);
  return fileConfig.skills?.fileSizeLimit ?? MAX_IMPORT_SIZE;
}

const skillImportFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    // N.B. The error handler at the bottom of this file matches this "Only " prefix.
    cb(new Error('Only .md, .zip, and .skill files are allowed'), false);
  }
};

const skillUpload = (req, res, next) =>
  multer({
    storage: memoryStorage,
    fileFilter: skillImportFilter,
    limits: { fileSize: getSkillImportSizeLimit(req) },
  }).single('file')(req, res, next);

// Per-file upload (for adding individual files to an existing skill)
const MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const singleFileUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_SINGLE_FILE_SIZE },
});

// ---------------------------------------------------------------------------
// Role-based capability gates
// ---------------------------------------------------------------------------
const checkSkillAccess = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkSkillCreate = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

// ---------------------------------------------------------------------------
// Rate limiters (reuse existing file upload limiters)
// ---------------------------------------------------------------------------
const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkSkillAccess);

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------
const { getSkillsHandlers } = require('~/server/services/Skills/handlers');
const handlers = getSkillsHandlers();

// ---------------------------------------------------------------------------
// File storage helper: resolve the active strategy's saveBuffer
// ---------------------------------------------------------------------------
function resolveSkillStorage(req, { isImage = false } = {}) {
  const source = getFileStrategy(req.config, { context: FileContext.skill_file, isImage });
  const strategy = getStrategyFunctions(source);
  if (!strategy.saveBuffer) {
    throw new Error(`Storage backend "${source}" does not support file writes`);
  }
  return { saveBuffer: strategy.saveBuffer, source };
}

// ---------------------------------------------------------------------------
// Import handler (zip/md/skill → create skill + files)
// ---------------------------------------------------------------------------
const importHandler = createImportHandler({
  limits: (req) => ({
    maxZipBytes: getSkillImportSizeLimit(req),
  }),
  createSkill,
  getSkillById,
  deleteSkill,
  upsertSkillFile,
  saveBuffer: (req, { userId, buffer, fileName, basePath, isImage, tenantId }) => {
    const requestTenantId = tenantId ?? resolveRequestTenantId(req);
    const storage = resolveSkillStorage(req, { isImage });
    return storage
      .saveBuffer({ userId, buffer, fileName, basePath, tenantId: requestTenantId })
      .then((filepath) => ({
        filepath,
        source: storage.source,
        ...getStorageMetadata({ filepath, source: storage.source }),
      }));
  },
  deleteFile: (req, file) => {
    const { deleteFile } = getStrategyFunctions(file.source);
    if (deleteFile) {
      return deleteFile(req, file);
    }
    return Promise.resolve();
  },
  grantPermission,
  resolveScannerToken: resolveSkillScannerToken,
});

// ---------------------------------------------------------------------------
// Per-file upload handler (add a single file to an existing skill)
// ---------------------------------------------------------------------------
const baseUploadFileHandler = createSkillUploadHandler({
  getSkillById,
  getSkillFileByPath,
  upsertSkillFile,
  resolveStorage: resolveSkillStorage,
  getStrategyFunctions,
});

// Deloitte Custom Change: run the OBO skill-scanner check (PR #616) on the file
// buffer before delegating to upstream's createSkillUploadHandler, which has no
// scanner concept of its own.
async function uploadFileHandler(req, res) {
  const { file } = req;
  if (file) {
    try {
      const scannerToken = process.env.SKILL_SCANNER_URL
        ? await resolveSkillScannerToken(req.user)
        : undefined;
      await scanSkillFileUpload({
        fileName: file.originalname,
        content: file.buffer,
        token: scannerToken,
      });
    } catch (error) {
      if (isSkillScanError(error)) {
        return res.status(error.statusCode).json({
          error: 'Skill scan failed',
          message: error.message,
          issues: error.issues,
        });
      }
      logger.error('[uploadFile] Scan error:', error);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  }
  return baseUploadFileHandler(req, res);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
async function maybeStartRequestSkillSync(req, _res, next) {
  try {
    await maybeRunGitHubSkillSyncForRequest(req);
  } catch (error) {
    logger.error('[GET /skills] Failed to start request-scoped skill sync:', error);
  }
  next();
}

// Import: accepts .md / .zip / .skill via multipart
router.post(
  '/import',
  checkSkillCreate,
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  skillUpload,
  restoreTenantContextFromReq,
  importHandler,
);

router.get('/', maybeStartRequestSkillSync, handlers.list);
router.post('/', checkSkillCreate, handlers.create);

/**
 * Owner-scoped list of the caller's own private inline skills expiring
 * within the configured warning window. Registered before `/:id` so the
 * literal segment isn't swallowed by the param route.
 * @route GET /skills/expiring
 */
router.get('/expiring', async (req, res) => {
  try {
    const { status, body } = await handleSkillsExpiringSoonRequest(req.user ?? {}, {
      getSkillsExpiringSoon,
      retentionWarningHours: getAgentRetentionWarningHours(req.config?.interfaceConfig),
    });
    return res.status(status).json(body);
  } catch (error) {
    logger.error('[/skills/expiring] Failed to list expiring skills', error);
    return res.status(500).json({ code: 'SKILLS_EXPIRING_FAILED' });
  }
});

/**
 * Owner-scoped renewal of a private inline skill's independent retention
 * deadline.
 * @route POST /skills/:id/renew
 */
router.post('/:id/renew', async (req, res) => {
  try {
    const { status, body } = await handleSkillRenewRequest(
      req.user ?? {},
      { skill_id: req.params.id },
      {
        renewSkillActivity,
        retentionHours: getAgentRetentionHours(req.config?.interfaceConfig),
      },
    );
    return res.status(status).json(body);
  } catch (error) {
    logger.error('[/skills/:id/renew] Failed to renew skill', error);
    return res.status(500).json({ code: 'SKILL_RENEW_FAILED' });
  }
});

router.get(
  '/:id',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.get,
);

router.patch(
  '/:id',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.patch,
);

router.delete(
  '/:id',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.DELETE }),
  handlers.delete,
);

router.get(
  '/:id/files',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.listFiles,
);

// Legacy upload and revision-checked editing. Older servers have no POST wildcard route.
router.post(
  ['/:id/files', '/:id/files/*relativePath'],
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  singleFileUpload.single('file'),
  restoreTenantContextFromReq,
  uploadFileHandler,
);

// Wildcard splat (`*relativePath`) captures nested skill paths (e.g.
// `references/guide.md`) whether the client sends an encoded `%2F` or a proxy
// has already decoded it to a literal slash. A single `:relativePath` segment
// 404s in the latter case, which is why nested files failed behind proxies.
router.get(
  '/:id/files/*relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.downloadFile,
);

router.delete(
  '/:id/files/*relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.deleteFile,
);

// Multer + file-filter error handler — surface as 400, forward everything else

router.use((err, _req, res, next) => {
  if (err && (err.name === 'MulterError' || err.message?.startsWith('Only '))) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

module.exports = router;
