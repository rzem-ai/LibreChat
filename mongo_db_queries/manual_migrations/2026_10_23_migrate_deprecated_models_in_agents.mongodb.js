//Mongo DB Playground
// use("mdb-librechat-database-dev");
//
//// Order: confirm_data -> dry_run -> migrate -> confirm_data -> clean_up. rollback restores from the backup.
//const STEP = 'confirm_data'; // confirm_data | dry_run | migrate | clean_up | rollback
//const BACKUP_COLLECTION = 'agents_backup_2026_10_23';
//
//const MAPPINGS = [
//  { from: 'gpt-56-luna', to: 'gpt-6-luna' },
//  { from: 'gpt-56-sol', to: 'gpt-61-sol' },
//  { from: 'claude-haiku-4-5', to: 'claude-haiku-5-5' },
//  { from: 'claude-sonnet-4-6', to: 'claude-sonnet-5-5' },
//  { from: 'claude-sonnet-5', to: 'claude-sonnet-5-5' },
//  { from: 'claude-opus-4-6', to: 'claude-opus-5-5' },
//  { from: 'claude-opus-4-8', to: 'claude-opus-5-5' },
//  {
//    from: 'au.anthropic.claude-haiku-4-5-20251001-v1:0',
//    to: 'au.anthropic.claude-haiku-5-5',
//  },
//  { from: 'au.anthropic.claude-sonnet-4-6', to: 'au.anthropic.claude-sonnet-5-5' },
//  { from: 'google/gemini-2.5-flash', to: 'gpt-6-luna', provider: 'Azure Global' },
//  { from: 'google/gemini-2.5-pro', to: 'gpt-56-terra', provider: 'Azure Global' },
//];
//
//const DEPRECATED_MODELS = MAPPINGS.map((m) => m.from);
//const AFFECTED = {
//  $or: [{ model: { $in: DEPRECATED_MODELS } }, { 'versions.model': { $in: DEPRECATED_MODELS } }],
//};
//
//const modelExpr = (modelRef) => ({
//  $switch: {
//    branches: MAPPINGS.map((m) => ({ case: { $eq: [modelRef, m.from] }, then: m.to })),
//    default: modelRef,
//  },
//});
//
//const providerExpr = (modelRef, providerRef) => ({
//  $switch: {
//    branches: MAPPINGS.filter((m) => m.provider).map((m) => ({
//      case: { $eq: [modelRef, m.from] },
//      then: m.provider,
//    })),
//    default: providerRef,
//  },
//});
//
//const MIGRATE_STAGES = [
//  {
//    $set: {
//      provider: providerExpr('$model', '$provider'),
//      model: modelExpr('$model'),
//      versions: {
//        $map: {
//          input: { $ifNull: ['$versions', []] },
//          as: 'v',
//          in: {
//            $mergeObjects: [
//              '$$v',
//              {
//                provider: providerExpr('$$v.model', '$$v.provider'),
//                model: modelExpr('$$v.model'),
//              },
//            ],
//          },
//        },
//      },
//    },
//  },
//];
//
//const backupExists = () => db.getCollectionNames().includes(BACKUP_COLLECTION);
//const remaining = () => db.agents.countDocuments(AFFECTED);
//
//const withOwner = [
//  { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'owner' } },
//  { $addFields: { ownerEmail: { $arrayElemAt: ['$owner.email', 0] } } },
//];
//
//const confirmData = () =>
//  db.agents
//    .aggregate([
//      { $match: AFFECTED },
//      ...withOwner,
//      {
//        $project: {
//          id: 1,
//          name: 1,
//          provider: 1,
//          model: 1,
//          ownerEmail: 1,
//          inVersionsOnly: { $not: [{ $in: ['$model', DEPRECATED_MODELS] }] },
//        },
//      },
//      {
//        $facet: {
//          byModel: [
//            {
//              $group: {
//                _id: { provider: '$provider', model: '$model' },
//                agentCount: { $sum: 1 },
//                inVersionsOnly: { $sum: { $cond: ['$inVersionsOnly', 1, 0] } },
//                owners: { $addToSet: '$ownerEmail' },
//              },
//            },
//            {
//              $project: {
//                _id: 0,
//                provider: '$_id.provider',
//                model: '$_id.model',
//                agentCount: 1,
//                inVersionsOnly: 1,
//                ownerCount: { $size: '$owners' },
//                owners: 1,
//              },
//            },
//            { $sort: { agentCount: -1 } },
//          ],
//          byOwner: [
//            {
//              $group: {
//                _id: '$ownerEmail',
//                agentCount: { $sum: 1 },
//                agents: { $push: { id: '$id', name: '$name', model: '$model' } },
//              },
//            },
//            { $project: { _id: 0, ownerEmail: '$_id', agentCount: 1, agents: 1 } },
//            { $sort: { agentCount: -1 } },
//          ],
//          totals: [
//            { $group: { _id: null, agents: { $sum: 1 }, owners: { $addToSet: '$ownerEmail' } } },
//            { $project: { _id: 0, agents: 1, owners: { $size: '$owners' } } },
//          ],
//        },
//      },
//    ])
//    .toArray();
//
//const dryRun = () => ({
//  backupCollection: BACKUP_COLLECTION,
//  backupExists: backupExists(),
//  agentsToMigrate: remaining(),
//  preview: db.agents
//    .aggregate([
//      { $match: AFFECTED },
//      ...MIGRATE_STAGES,
//      {
//        $lookup: { from: 'agents', localField: '_id', foreignField: '_id', as: 'current' },
//      },
//      {
//        $project: {
//          _id: 0,
//          id: 1,
//          name: 1,
//          before: {
//            provider: { $arrayElemAt: ['$current.provider', 0] },
//            model: { $arrayElemAt: ['$current.model', 0] },
//          },
//          after: { provider: '$provider', model: '$model' },
//          versionsRewritten: {
//            $size: {
//              $filter: {
//                input: { $ifNull: [{ $arrayElemAt: ['$current.versions', 0] }, []] },
//                as: 'v',
//                cond: { $in: ['$$v.model', DEPRECATED_MODELS] },
//              },
//            },
//          },
//        },
//      },
//    ])
//    .toArray(),
//});
//
//const migrate = () => {
//  const before = remaining();
//  if (before === 0) return { message: 'Nothing to migrate.' };
//  if (backupExists()) {
//    throw new Error(`${BACKUP_COLLECTION} already exists; run clean_up or drop it before re-running.`);
//  }
//  db.agents.aggregate([{ $match: AFFECTED }, { $out: BACKUP_COLLECTION }]);
//  const backedUp = db[BACKUP_COLLECTION].countDocuments();
//  if (backedUp !== before) {
//    throw new Error(`Backup has ${backedUp} docs, expected ${before}; aborting before any write.`);
//  }
//  const result = db.agents.updateMany(AFFECTED, MIGRATE_STAGES);
//  return {
//    backedUp,
//    matched: result.matchedCount,
//    modified: result.modifiedCount,
//    remaining: remaining(),
//    expectedRemaining: 0,
//  };
//};
//
//const cleanUp = () => {
//  if (!backupExists()) return { message: `${BACKUP_COLLECTION} does not exist.` };
//  const left = remaining();
//  if (left > 0) {
//    throw new Error(`${left} agents still reference deprecated models; refusing to drop the backup.`);
//  }
//  const dropped = db[BACKUP_COLLECTION].countDocuments();
//  return { dropped: db[BACKUP_COLLECTION].drop(), documentsRemoved: dropped };
//};
//
//const rollback = () => {
//  if (!backupExists()) throw new Error(`${BACKUP_COLLECTION} does not exist; nothing to restore.`);
//  const ops = db[BACKUP_COLLECTION]
//    .find()
//    .toArray()
//    .map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc } }));
//  if (ops.length === 0) return { message: 'Backup is empty.' };
//  const result = db.agents.bulkWrite(ops);
//  return { restored: result.matchedCount, modified: result.modifiedCount, remaining: remaining() };
//};
//
//const STEPS = {
//  confirm_data: confirmData,
//  dry_run: dryRun,
//  migrate,
//  clean_up: cleanUp,
//  rollback,
//};
//
//if (!STEPS[STEP]) throw new Error(`Unknown STEP "${STEP}". Use: ${Object.keys(STEPS).join(' | ')}`);
//
//STEPS[STEP]();
