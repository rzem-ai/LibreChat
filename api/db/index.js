const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { createResearchModels } = require('@librechat/researcher');
const { connectDb } = require('./connect');

// createModels MUST run before requiring indexSync.
// indexSync.js captures mongoose.models.Message and mongoose.models.Conversation
// at module load time. If those models are not registered first, all MeiliSearch
// sync operations will silently fail on every startup.
createModels(mongoose);
createResearchModels(mongoose);

const indexSync = require('./indexSync');

module.exports = { connectDb, indexSync };
