import { ResourceType, PrincipalType } from 'librechat-data-provider';
import type { IAclEntry } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

/** One claimed candidate's identity, enough to classify it as private-and-eligible. */
export interface RetentionClassificationCandidate {
  /** Mongo `_id` — what `AclEntry.resourceId` references. */
  resourceId: Types.ObjectId | string;
  author: Types.ObjectId | string;
}

export interface AgentRetentionCandidate extends RetentionClassificationCandidate {
  /** Promoted (catalog) agents are never purge-eligible regardless of sharing. */
  isPromoted: boolean;
  /** The custom `agent.id` string, keyed by the legacy `projects.agentIds` fallback. */
  legacyId: string;
}

export interface SkillRetentionCandidate extends RetentionClassificationCandidate {
  /** Only `source: 'inline'` skills are purge-eligible; synced skills are exempt. */
  source: string;
}

export interface ClassificationDeps {
  findEntriesByResources: (
    resourceType: string,
    resourceIds: Array<string | Types.ObjectId>,
  ) => Promise<IAclEntry[]>;
}

export interface AgentClassificationDeps extends ClassificationDeps {
  /** Legacy pre-ACL-migration fallback: `projects` doc named `instance`. */
  getGlobalAgentIds: () => Promise<Set<string>>;
}

function isOtherPrincipalEntry(
  entry: Pick<IAclEntry, 'principalType' | 'principalId'>,
  authorId: string,
): boolean {
  if (entry.principalType === PrincipalType.PUBLIC) {
    return true;
  }
  if (entry.principalType === PrincipalType.GROUP || entry.principalType === PrincipalType.ROLE) {
    return true;
  }
  return String(entry.principalId) !== authorId;
}

function groupEntriesByResource(entries: IAclEntry[]): Map<string, IAclEntry[]> {
  const byResource = new Map<string, IAclEntry[]>();
  for (const entry of entries) {
    const key = String(entry.resourceId);
    const list = byResource.get(key);
    if (list) {
      list.push(entry);
    } else {
      byResource.set(key, [entry]);
    }
  }
  return byResource;
}

/**
 * Classifies a claimed batch of agents as private-and-eligible for retention purge.
 * Promoted (catalog) agents are excluded outright. For the rest, "private" means no
 * ACL entry (any permission level, under either `AGENT` or `REMOTE_AGENT`) grants
 * access to any principal other than the author. Agents with zero ACL entries
 * (not yet migrated to the granular permission system) fall back to the legacy
 * `projects` "instance" doc: present in `agentIds` means shared, absent means private.
 */
export async function classifyPrivateAgents(
  candidates: AgentRetentionCandidate[],
  deps: AgentClassificationDeps,
): Promise<Set<string>> {
  const classifiable = candidates.filter((candidate) => !candidate.isPromoted);
  if (classifiable.length === 0) {
    return new Set();
  }

  const resourceIds = classifiable.map((candidate) => candidate.resourceId);
  const [agentEntries, remoteAgentEntries, globalAgentIds] = await Promise.all([
    deps.findEntriesByResources(ResourceType.AGENT, resourceIds),
    deps.findEntriesByResources(ResourceType.REMOTE_AGENT, resourceIds),
    deps.getGlobalAgentIds(),
  ]);
  const entriesByResource = groupEntriesByResource([...agentEntries, ...remoteAgentEntries]);

  const privateIds = new Set<string>();
  for (const candidate of classifiable) {
    const key = String(candidate.resourceId);
    const entries = entriesByResource.get(key);
    const authorId = String(candidate.author);

    if (!entries || entries.length === 0) {
      if (!globalAgentIds.has(candidate.legacyId)) {
        privateIds.add(key);
      }
      continue;
    }

    const hasOtherPrincipal = entries.some((entry) => isOtherPrincipalEntry(entry, authorId));
    if (!hasOtherPrincipal) {
      privateIds.add(key);
    }
  }

  return privateIds;
}

/**
 * Classifies a claimed batch of skills as private-and-eligible for retention purge.
 * GitHub/Notion-synced skills (`source !== 'inline'`) are exempt regardless of
 * privacy. Skills are ACL-only since inception (no legacy fallback): a skill with
 * zero ACL entries is private by construction.
 */
export async function classifyPrivateSkills(
  candidates: SkillRetentionCandidate[],
  deps: ClassificationDeps,
): Promise<Set<string>> {
  const classifiable = candidates.filter((candidate) => candidate.source === 'inline');
  if (classifiable.length === 0) {
    return new Set();
  }

  const resourceIds = classifiable.map((candidate) => candidate.resourceId);
  const entries = await deps.findEntriesByResources(ResourceType.SKILL, resourceIds);
  const entriesByResource = groupEntriesByResource(entries);

  const privateIds = new Set<string>();
  for (const candidate of classifiable) {
    const key = String(candidate.resourceId);
    const authorId = String(candidate.author);
    const resourceEntries = entriesByResource.get(key);

    if (!resourceEntries || resourceEntries.length === 0) {
      privateIds.add(key);
      continue;
    }

    const hasOtherPrincipal = resourceEntries.some((entry) =>
      isOtherPrincipalEntry(entry, authorId),
    );
    if (!hasOtherPrincipal) {
      privateIds.add(key);
    }
  }

  return privateIds;
}
