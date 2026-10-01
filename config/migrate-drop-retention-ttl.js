require('dotenv').config();
process.env.MONGO_AUTO_INDEX = 'false';
process.env.MONGO_AUTO_CREATE = 'false';
const mongoose = require('mongoose');
const { dropRetentionTTLIndexes } = require('@librechat/data-schemas');
const connect = require('./connect');

/**
 * Deploy the purge worker (`startConversationPurgeSweep`) in the same release as this
 * migration — see `dropRetentionTTLIndexes` for why. Never run `migrate-conversation-retention`
 * against a database where this migration has not yet run and the worker is not yet live.
 */
(async () => {
  try {
    await connect();
    const result = await dropRetentionTTLIndexes(mongoose.connection, {
      dryRun: process.argv.includes('--dry-run'),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.errors.length > 0 ? 1 : 0;
  } catch (error) {
    console.error('Retention TTL index migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
