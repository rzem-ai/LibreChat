const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { researchStatusHandler } = require('@librechat/researcher');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { getResearchHost } = require('~/server/services/Research');

const router = express.Router();
router.use(requireJwtAuth);
router.use(configMiddleware);

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const handlers = () => getResearchHost().handlers;
const feeds = () => getResearchHost().feedHandlers;
const schedules = () => getResearchHost().scheduleHandlers;

router.get('/status', researchStatusHandler);
router.get('/jobs', (req, res) => handlers().listJobs(req, res));
router.get('/jobs/:jobId', (req, res) => handlers().getJob(req, res));
router.post('/jobs/:jobId/cancel', (req, res) => handlers().cancelJob(req, res));

router.get('/feeds', (req, res) => feeds().listSubscriptions(req, res));
router.get('/feeds/opml', (req, res) => feeds().exportOpml(req, res));
router.post('/feeds/opml', (req, res) => feeds().importOpml(req, res));
router.get('/feeds/catalogue', (req, res) => feeds().listCatalogue(req, res));
router.post('/feeds/catalogue', requireAdminAccess, (req, res) =>
  feeds().addCatalogueFeed(req, res),
);
router.patch('/feeds/catalogue/:feedId', requireAdminAccess, (req, res) =>
  feeds().updateCatalogueFeed(req, res),
);
router.post('/feeds/catalogue/:feedId/subscribe', (req, res) =>
  feeds().subscribeCatalogue(req, res),
);
router.post('/feeds/folders/rename', (req, res) => feeds().renameFolder(req, res));
router.get('/feeds/:feedId/items', (req, res) => feeds().listItems(req, res));
router.patch('/feeds/:feedId', (req, res) => feeds().moveFeed(req, res));
router.delete('/feeds/:feedId', (req, res) => feeds().unsubscribe(req, res));

router.get('/schedules', (req, res) => schedules().listSchedules(req, res));
router.put('/schedules/:scheduleId', (req, res) => schedules().updateSchedule(req, res));
router.delete('/schedules/:scheduleId', (req, res) => schedules().resetSchedule(req, res));

module.exports = router;
