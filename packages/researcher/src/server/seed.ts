import { logger as defaultLogger } from '@librechat/data-schemas';
import { SystemRoles, ResourceType, AccessRoleIds, PrincipalType } from 'librechat-data-provider';
import type { TResearchConfig } from '../contract/research';
import type { ResearchHostMethods } from '../db';
import { ResearchJobType, RESEARCH_AGENT_IDS, RESEARCH_AGENT_CATEGORY } from '../contract/types';
import { researchAgentDefinition } from './instructions';
import { seedRecursionLimit } from './budget';

export type SeedMethods = Pick<
  ResearchHostMethods,
  | 'getAgent'
  | 'createAgent'
  | 'updateAgent'
  | 'getAllCategories'
  | 'createCategory'
  | 'findRoleByIdentifier'
  | 'grantPermission'
  | 'findUser'
>;

export type SeedResult = {
  created: string[];
  skipped: string[];
  reason?: 'disabled' | 'missing_model' | 'no_author';
};

const CATEGORY_ORDER = 7;

async function ensureCategory(methods: SeedMethods): Promise<void> {
  const categories = await methods.getAllCategories();
  if (categories.some((category) => category.value === RESEARCH_AGENT_CATEGORY)) {
    return;
  }
  await methods.createCategory({
    value: RESEARCH_AGENT_CATEGORY,
    label: 'com_agents_category_research',
    description: 'com_agents_category_research_description',
    order: CATEGORY_ORDER,
  });
}

async function resolveAuthor(
  methods: SeedMethods,
  configured: string | undefined,
): Promise<string | undefined> {
  if (configured) {
    const user = await methods.findUser({ _id: configured }, '_id');
    return user ? String(user._id) : undefined;
  }
  const admin = await methods.findUser({ role: SystemRoles.ADMIN }, '_id');
  return admin ? String(admin._id) : undefined;
}

async function grant(
  methods: SeedMethods,
  principalType: PrincipalType,
  principalId: string | null,
  resourceId: unknown,
  accessRoleId: AccessRoleIds,
  grantedBy: string,
): Promise<void> {
  const role = await methods.findRoleByIdentifier(accessRoleId);
  if (!role) {
    throw new Error(`[research] Access role ${accessRoleId} is not seeded`);
  }
  await methods.grantPermission(
    principalType,
    principalId,
    ResourceType.AGENT,
    resourceId as string,
    role.permBits,
    grantedBy,
    undefined,
    role._id,
  );
}

/**
 * Seeds the Research category and the five fixed-id research agents (design 5.11).
 * Seed-if-missing: an existing agent is never touched, so an admin's tuning survives
 * every boot. Provider and model come from `research.agents`; an operator who wants the
 * shipped instructions back deletes the agent and restarts.
 */
export async function seedResearchAgents(deps: {
  methods: SeedMethods;
  config: TResearchConfig | undefined;
  maxRecursionLimit?: number;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn'>;
}): Promise<SeedResult> {
  const { methods, config } = deps;
  const log = deps.logger ?? defaultLogger;
  const ids = Object.values(RESEARCH_AGENT_IDS);
  if (!config?.enabled) {
    return { created: [], skipped: ids, reason: 'disabled' };
  }
  const { provider, model } = config.agents;
  if (!provider || !model) {
    log.warn('[research] research.agents.provider and model are required to seed research agents');
    return { created: [], skipped: ids, reason: 'missing_model' };
  }
  const author = await resolveAuthor(methods, config.agents.author);
  if (!author) {
    log.warn(
      '[research] No author for research agents: set research.agents.author or create an admin',
    );
    return { created: [], skipped: ids, reason: 'no_author' };
  }

  await ensureCategory(methods);

  const result: SeedResult = { created: [], skipped: [] };
  for (const jobType of Object.values(ResearchJobType)) {
    const id = RESEARCH_AGENT_IDS[jobType];
    const definition = researchAgentDefinition(jobType);
    const existing = await methods.getAgent({ id }, { _id: 1, conversation_starters: 1 });
    if (existing) {
      /** Starters arrived after the first seed; fill them in only where there are none. */
      if (!existing.conversation_starters?.length) {
        await methods.updateAgent(
          { id },
          { conversation_starters: definition.conversation_starters },
          { skipVersioning: true },
        );
      }
      result.skipped.push(id);
      continue;
    }
    const agent = await methods.createAgent({
      id,
      name: definition.name,
      description: definition.description,
      instructions: definition.instructions,
      provider,
      model,
      author,
      category: RESEARCH_AGENT_CATEGORY,
      tools: definition.tools,
      conversation_starters: definition.conversation_starters,
      recursion_limit: seedRecursionLimit(config.jobs[jobType].maxSteps, deps.maxRecursionLimit),
      subagents: { enabled: true, allowSelf: true },
    });
    await grant(methods, PrincipalType.USER, author, agent._id, AccessRoleIds.AGENT_OWNER, author);
    await grant(methods, PrincipalType.PUBLIC, null, agent._id, AccessRoleIds.AGENT_VIEWER, author);
    result.created.push(id);
  }
  if (result.created.length > 0) {
    log.info(`[research] Seeded research agents: ${result.created.join(', ')}`);
  }
  return result;
}
