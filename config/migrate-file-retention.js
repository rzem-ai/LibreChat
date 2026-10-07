require('dotenv').config();
process.env.MONGO_AUTO_INDEX = 'false';
process.env.MONGO_AUTO_CREATE = 'false';
const mongoose = require('mongoose');
const { backfillFileRetention } = require('@librechat/data-schemas');
const connect = require('./connect');

async function migrateFileRetention({ dryRun = false, batchSize } = {}) {
  await connect();
  return backfillFileRetention(mongoose.connection, {
    dryRun,
    ...(batchSize != null && { batchSize }),
  });
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const batchSizeArg = process.argv.find((arg) => arg.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : undefined;

  (async () => {
    try {
      const result = await migrateFileRetention({ dryRun, batchSize });
      console.log(dryRun ? '\n=== DRY RUN RESULTS ===' : '\n=== MIGRATION RESULTS ===');
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = 0;
    } catch (error) {
      console.error('File retention backfill failed:', error);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}

module.exports = { migrateFileRetention };
