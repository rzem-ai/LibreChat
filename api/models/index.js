const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const { createResearchDbMethods } = require('@librechat/researcher');
const { matchModelName, findMatchingPattern, isDeploymentSkillId } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const methods = createMethods(mongoose, {
  matchModelName,
  findMatchingPattern,
  isExternalSkillId: isDeploymentSkillId,
  getCache: getLogStores,
});

/** Research methods share the app's connection; the research host reads them from here. */
Object.assign(methods, createResearchDbMethods(mongoose));

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
  await methods.seedSystemGrants();
};

module.exports = {
  ...methods,
  seedDatabase,
};
