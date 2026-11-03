const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { createResearchModels } = require('@librechat/researcher');
const models = createModels(mongoose);
const researchModels = createResearchModels(mongoose);

module.exports = { ...models, ...researchModels };
