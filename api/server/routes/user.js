const express = require('express');
const {
  updateUserPluginsController,
  resendVerificationController,
  getTermsStatusController,
  acceptTermsController,
  getTutorialStateController,
  updateTutorialStateController,
  verifyEmailController,
  deleteUserController,
  getUserController,
} = require('~/server/controllers/UserController');
const {
  verifyEmailLimiter,
  verifyEmailSubmissionLimiter,
  configMiddleware,
  canDeleteAccount,
  requireJwtAuth,
} = require('~/server/middleware');

const settings = require('./settings');

const router = express.Router();

router.use('/settings', settings);
router.get('/', requireJwtAuth, getUserController);
router.get('/terms', requireJwtAuth, getTermsStatusController);
router.post('/terms/accept', requireJwtAuth, acceptTermsController);
router.get('/tutorial', requireJwtAuth, getTutorialStateController);
router.post('/tutorial', requireJwtAuth, updateTutorialStateController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, configMiddleware, deleteUserController);
router.post('/verify', verifyEmailSubmissionLimiter, verifyEmailController);
router.post('/verify/resend', verifyEmailLimiter, resendVerificationController);

module.exports = router;
