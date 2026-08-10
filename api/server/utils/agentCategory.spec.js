const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels, runAsSystem } = require('@librechat/data-schemas');

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  getTransactionSupport: jest.fn().mockResolvedValue(false),
  createModels: jest.requireActual('@librechat/data-schemas').createModels,
}));

/** `~/models` pulls in `getLogStores`, which builds Keyv/Mongo/Redis stores at module scope. */
jest.mock('~/cache/getLogStores', () =>
  jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
);

const { syncCategories } = require('./agentCategory');

const DEFAULT_VALUES = ['general', 'hr', 'rd', 'finance', 'it', 'sales', 'aftersales'];

let mongoServer;
let AgentCategory;
let models;

const sync = (list, enableDefaultCategories) =>
  runAsSystem(() => syncCategories(list, enableDefaultCategories));

const seedDefaults = () => runAsSystem(() => models.ensureDefaultCategories());

async function categoriesByValue() {
  const rows = await AgentCategory.find({}).lean();
  return new Map(rows.map((row) => [row.value, row]));
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  createModels(mongoose);
  AgentCategory = mongoose.models.AgentCategory;
  models = require('~/models');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await AgentCategory.deleteMany({});
  await seedDefaults();
});

describe('syncCategories', () => {
  it('seeds the expected default categories before each case', async () => {
    const categories = await categoriesByValue();
    expect([...categories.keys()].sort()).toEqual([...DEFAULT_VALUES].sort());
    expect(categories.get('general').label).toBe('com_agents_category_general');
  });

  describe('the general fallback category', () => {
    it('stays active when default categories are disabled', async () => {
      await sync(undefined, false);

      const categories = await categoriesByValue();
      expect(categories.get('general').isActive).toBe(true);
      for (const value of DEFAULT_VALUES.filter((v) => v !== 'general')) {
        expect(categories.get(value).isActive).toBe(false);
      }
    });
  });

  describe('custom category lifecycle', () => {
    it('creates custom categories from config with the expected label fallback', async () => {
      await sync(
        [
          { value: 'pursue-shape', label: 'Pursue & Shape' },
          { value: 'discover-define', label: 'Discover & Define' },
        ],
        false,
      );

      const categories = await categoriesByValue();
      expect(categories.get('pursue-shape')).toMatchObject({
        label: 'Pursue & Shape',
        custom: true,
        isActive: true,
      });
      expect(categories.get('discover-define')).toMatchObject({
        label: 'Discover & Define',
        custom: true,
        isActive: true,
      });
    });

    it('deletes custom categories that are no longer in the config', async () => {
      await sync([{ value: 'education' }], true);
      expect((await categoriesByValue()).has('education')).toBe(true);

      await sync([], true);
      expect((await categoriesByValue()).has('education')).toBe(false);
    });

    it('leaves custom categories untouched when no list is provided', async () => {
      await sync([{ value: 'education' }], true);
      await sync(undefined, true);

      expect((await categoriesByValue()).has('education')).toBe(true);
    });
  });

  describe('overriding default categories', () => {
    it('applies the label without converting the row to a custom category', async () => {
      const before = (await categoriesByValue()).get('aftersales');

      await sync([{ value: 'aftersales', label: 'Customer Success' }], true);

      const after = (await categoriesByValue()).get('aftersales');
      expect(after).toMatchObject({ label: 'Customer Success', custom: false, isActive: true });
      expect(after.order).toBe(before.order);
    });
  });
});
