// Deloitte Custom Change: disable custom Actions when customDeloitteFeatureFlags.createActions is false.
function areCustomActionsEnabled(config) {
  return config?.interfaceConfig?.customDeloitteFeatureFlags?.createActions !== false;
}

// Deloitte Custom Change: disable custom Actions when customDeloitteFeatureFlags.createActions is false.
function rejectDisabledActions(req, res, next) {
  if (areCustomActionsEnabled(req.config)) {
    return next();
  }

  return res.status(403).json({ message: 'Action creation is disabled' });
}

module.exports = { areCustomActionsEnabled, rejectDisabledActions };
