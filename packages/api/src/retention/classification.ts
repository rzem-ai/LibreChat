import { ResourceType } from 'librechat-data-provider';
import type { IAclEntry } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

/** One claimed candidate's identity, enough to classify its purge eligibility. */
export interface RetentionClassificationCandidate {
  /** Mongo `_id` — what `AclEntry.resourceId` references. */
  resourceId: Types.ObjectId | string;
  author: Types.ObjectId | string;
}

export interface AgentRetentionCandidate extends RetentionClassificationCandidate {
  /** Promoted (catalog) agents are never purge-eligible. Admin-controlled, not sharing. */
  isPromoted: boolean;
  /** The custom `agent.id` string, keyed by the legacy `projects.agentIds` fallback. */
  legacyId: string;
}

export interface SkillRetentionCandidate extends RetentionClassificationCandidate {
  /** Only `source: 'inline'` skills are purge-eligible; synced skills are exempt. */
  source: string;
}

export interface AgentClassificationDeps {
  findEntriesByResources: (
    resourceType: string,
    resourceIds: Array<string | Types.ObjectId>,
  ) => Promise<IAclEntry[]>;
  /** Legacy pre-ACL-migration fallback: `projects` doc named `instance`. */
  getGlobalAgentIds: () => Promise<Set<string>>;
}

function resourceIdsWithEntries(entries: IAclEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    ids.add(String(entry.resourceId));
  }
  return ids;
}

/**
 * Determines which claimed agents are still eligible for retention purge.
 * Eligibility is an admin decision, never a function of who an agent is shared
 * with: promoted (catalog) agents are always excluded, and agents from before
 * the ACL system existed (zero ACL entries) fall back to the legacy `projects`
 * "instance" doc — an admin-maintained, instance-wide list, not per-user sharing.
 * Every other agent — shared or not — is eligible.
 */
export async function classifyAgentPurgeEligibility(
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
  const idsWithEntries = resourceIdsWithEntries([...agentEntries, ...remoteAgentEntries]);

  const eligibleIds = new Set<string>();
  for (const candidate of classifiable) {
    const key = String(candidate.resourceId);

    if (!idsWithEntries.has(key)) {
      if (!globalAgentIds.has(candidate.legacyId)) {
        eligibleIds.add(key);
      }
      continue;
    }

    eligibleIds.add(key);
  }

  return eligibleIds;
}

/**
 * Determines which claimed skills are still eligible for retention purge.
 * GitHub/Notion-synced skills (`source !== 'inline'`) are exempt; every inline
 * skill is eligible regardless of sharing — skills have no admin-controlled
 * exemption lever beyond `retentionException.exempt`, which is enforced at claim time.
 */
export async function classifySkillPurgeEligibility(
  candidates: SkillRetentionCandidate[],
): Promise<Set<string>> {
  const eligibleIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.source === 'inline') {
      eligibleIds.add(String(candidate.resourceId));
    }
  }
  return eligibleIds;
}

export interface MemoryRetentionCandidate {
  resourceId: Types.ObjectId | string;
}

/**
 * Determines which claimed memories are still eligible for retention purge.
 * Memory has no promotion, no sync source, no sharing, and (unlike agents/skills)
 * no admin-controlled exemption lever — every claimed candidate is eligible by
 * construction, since `claimExpiredMemories`'s eligibility filter and
 * `confirmMemoryPurgeEligible`'s fence re-check already enforce expiry and claim
 * ownership. Kept as a real function — not inlined away — so Memory satisfies the
 * same `GenericPurgeSweepDeps.classify` contract every other resource type does, and
 * so a future exclusion rule has an obvious home.
 */
export async function classifyMemoryPurgeEligibility(
  candidates: MemoryRetentionCandidate[],
): Promise<Set<string>> {
  return new Set(candidates.map((candidate) => String(candidate.resourceId)));
}
