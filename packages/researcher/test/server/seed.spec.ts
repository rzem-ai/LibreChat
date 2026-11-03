import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import { SystemRoles, ResourceType, PrincipalType } from 'librechat-data-provider';
import { researchSchema } from '../../src/contract/research';
import type { ResearchHostMethods } from '../../src/db';
import {
  ResearchJobType,
  RESEARCH_AGENT_IDS,
  RESEARCH_AGENT_CATEGORY,
} from '../../src/contract/types';
import { createResearchDbMethods, createResearchModels } from '../../src/db';
import { seedResearchAgents } from '../../src/server/seed';

const DB_SETUP_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let methods: ResearchHostMethods;
let adminId: string;

const enabled = researchSchema.parse({
  enabled: true,
  agents: { provider: 'gateway', model: 'gpt-gateway' },
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  createResearchModels(mongoose);
  methods = { ...createMethods(mongoose), ...createResearchDbMethods(mongoose) };
  await methods.seedDefaultRoles();
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await mongoose.models.Agent.deleteMany({});
  await mongoose.models.AgentCategory.deleteMany({});
  await mongoose.models.AclEntry.deleteMany({});
  await mongoose.models.User.deleteMany({});
  const admin = await mongoose.models.User.create({
    email: 'admin@example.com',
    username: 'admin',
    name: 'Admin',
    provider: 'local',
    role: SystemRoles.ADMIN,
  });
  adminId = String(admin._id);
});

describe('seedResearchAgents', () => {
  it('creates the five research agents in the Research category', async () => {
    const result = await seedResearchAgents({ methods, config: enabled, maxRecursionLimit: 100 });
    expect(result.created.sort()).toEqual(Object.values(RESEARCH_AGENT_IDS).sort());

    const solution = await methods.getAgent({ id: RESEARCH_AGENT_IDS[ResearchJobType.SOLUTION] });
    expect(solution).toMatchObject({
      provider: 'gateway',
      model: 'gpt-gateway',
      category: RESEARCH_AGENT_CATEGORY,
      recursion_limit: 100,
      subagents: { enabled: true, allowSelf: true },
    });
    expect(String(solution?.author)).toBe(adminId);
    expect(solution?.instructions).toContain('record_finding');
    expect(solution?.tools).toEqual(
      expect.arrayContaining(['read_document', 'search_uploads', 'fetch_page']),
    );
    expect(solution?.tools).not.toEqual(expect.arrayContaining(['web_search']));
    expect(solution?.tools).not.toEqual(expect.arrayContaining(['file_search']));

    const digest = await methods.getAgent({ id: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST] });
    expect(digest?.tools).not.toEqual(expect.arrayContaining(['read_document']));
    expect(digest?.tools).toEqual(expect.arrayContaining(['read_feed_items']));
    expect(solution?.tools).not.toEqual(expect.arrayContaining(['read_feed_items']));
    expect(digest?.recursion_limit).toBe(100);

    const categories = await methods.getAllCategories();
    expect(categories.map((c) => c.value)).toContain(RESEARCH_AGENT_CATEGORY);
  });

  it('grants public view and author ownership on each agent', async () => {
    await seedResearchAgents({ methods, config: enabled });
    const agent = await methods.getAgent({ id: RESEARCH_AGENT_IDS[ResearchJobType.TRENDS] });
    const entries = await mongoose.models.AclEntry.find({
      resourceType: ResourceType.AGENT,
      resourceId: agent?._id,
    }).lean();
    const types = entries.map((e) => e.principalType).sort();
    expect(types).toEqual([PrincipalType.PUBLIC, PrincipalType.USER].sort());
    const owner = entries.find((e) => e.principalType === PrincipalType.USER);
    expect(String(owner?.principalId)).toBe(adminId);
  });

  it('is idempotent and never overwrites an agent an admin has edited', async () => {
    await seedResearchAgents({ methods, config: enabled });
    await mongoose.models.Agent.updateOne(
      { id: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST] },
      { $set: { name: 'Tuned digest', model: 'other-model' } },
    );
    const second = await seedResearchAgents({ methods, config: enabled });
    expect(second.created).toEqual([]);
    expect(second.skipped).toHaveLength(5);
    const digest = await methods.getAgent({ id: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST] });
    expect(digest?.name).toBe('Tuned digest');
    expect(digest?.model).toBe('other-model');
    expect(await mongoose.models.Agent.countDocuments()).toBe(5);
    expect(
      await mongoose.models.AgentCategory.countDocuments({ value: RESEARCH_AGENT_CATEGORY }),
    ).toBe(1);
  });

  it('uses the configured author over the first admin', async () => {
    const author = await mongoose.models.User.create({
      email: 'owner@example.com',
      username: 'owner',
      provider: 'local',
      role: SystemRoles.USER,
    });
    const config = researchSchema.parse({
      enabled: true,
      agents: { provider: 'gateway', model: 'm', author: String(author._id) },
    });
    await seedResearchAgents({ methods, config });
    const agent = await methods.getAgent({ id: RESEARCH_AGENT_IDS[ResearchJobType.REQUIREMENTS] });
    expect(String(agent?.author)).toBe(String(author._id));
  });

  it('skips seeding when research is off or the model is not configured', async () => {
    expect(await seedResearchAgents({ methods, config: undefined })).toMatchObject({
      created: [],
      reason: 'disabled',
    });
    expect(
      await seedResearchAgents({ methods, config: researchSchema.parse({ enabled: true }) }),
    ).toMatchObject({ created: [], reason: 'missing_model' });
    expect(await mongoose.models.Agent.countDocuments()).toBe(0);
  });

  it('gives every research agent at least six distinct conversation starters', async () => {
    await seedResearchAgents({ methods, config: enabled });
    for (const id of Object.values(RESEARCH_AGENT_IDS)) {
      const agent = await methods.getAgent({ id });
      const starters = agent?.conversation_starters ?? [];
      expect(starters.length).toBeGreaterThanOrEqual(6);
      expect(new Set(starters).size).toBe(starters.length);
      expect(starters.every((text) => text.trim().length > 0 && text.length <= 200)).toBe(true);
    }
  });

  it('fills in starters on an existing research agent that has none, and keeps edited ones', async () => {
    await seedResearchAgents({ methods, config: enabled });
    await mongoose.models.Agent.updateOne(
      { id: RESEARCH_AGENT_IDS[ResearchJobType.TRENDS] },
      { $set: { conversation_starters: [] } },
    );
    await mongoose.models.Agent.updateOne(
      { id: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST] },
      { $set: { conversation_starters: ['My own starter'] } },
    );
    await seedResearchAgents({ methods, config: enabled });
    const trends = await methods.getAgent({ id: RESEARCH_AGENT_IDS[ResearchJobType.TRENDS] });
    const digest = await methods.getAgent({ id: RESEARCH_AGENT_IDS[ResearchJobType.DIGEST] });
    expect(trends?.conversation_starters?.length).toBeGreaterThanOrEqual(6);
    expect(digest?.conversation_starters).toEqual(['My own starter']);
  });
});
