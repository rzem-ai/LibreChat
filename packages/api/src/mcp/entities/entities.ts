import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';
import { resolveMCPSourceLink } from '../linkTemplates';

/** Upper bound on entities extracted from a single search/list result. */
const MAX_ENTITY_ITEMS = 30;

interface EntityRecord {
  entityID?: number | string;
  entityName?: string;
  lastApprovedDate?: string;
}

interface EntityListPayload {
  data?: {
    items?: EntityRecord[];
    entityID?: number | string;
    entityName?: string;
    lastApprovedDate?: string;
  };
}

/** Builds a single entity's {@link MCPResultSource}, or undefined if it has no identifiable field. */
function buildEntitySource(
  toolName: string,
  serverName: string,
  entity: EntityRecord,
): MCPResultSource | undefined {
  const entityName = typeof entity.entityName === 'string' ? entity.entityName.trim() : undefined;
  const entityID =
    typeof entity.entityID === 'string' ? entity.entityID.trim() || undefined : entity.entityID;
  if (!entityName && entityID == null) {
    return undefined;
  }
  const title = entityName || `Entity ${entityID}`;
  const metadataLines = [
    entityID != null ? `Entity ID: ${entityID}` : undefined,
    entity.lastApprovedDate ? `Last approved: ${entity.lastApprovedDate}` : undefined,
  ].filter(Boolean);
  return {
    toolName,
    serverName,
    title,
    link: resolveMCPSourceLink(toolName, { entityID }),
    content: [title, metadataLines.join('\n')].filter(Boolean).join('\n\n'),
  };
}

/**
 * Deloitte Custom Change
 * Parses the DESC/GIMS entity search/list payload shape
 * (`{ data: { items: [{ entityID, entityName, lastApprovedDate }] } }`, or a
 * single entity directly under `data` for `get_entity_by_id`-style calls)
 * into one {@link MCPResultSource} per entity, so each citation can point at
 * the specific entity instead of the whole raw JSON blob. Falls back to
 * `entityID` as the title when `entityName` is missing. Populates `link` once
 * a matching entry exists in {@link resolveMCPSourceLink}'s template registry
 * — until then it stays unset. Returns undefined (letting the caller fall
 * back) when the content isn't this entity shape, or no entity has any
 * identifiable field.
 */
export function buildEntitySources({
  toolName,
  serverName,
  content,
}: {
  toolName: string;
  serverName: string;
  content: string;
}): MCPSourcesResult | undefined {
  let parsed: EntityListPayload;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  const data = parsed?.data;
  if (!data) {
    return undefined;
  }

  if (Array.isArray(data.items)) {
    const sources: MCPResultSource[] = [];
    for (const entity of data.items.slice(0, MAX_ENTITY_ITEMS)) {
      const source = buildEntitySource(toolName, serverName, entity);
      if (source) {
        sources.push(source);
      }
    }
    return sources.length > 0 ? { sources } : undefined;
  }

  if (data.entityID != null || data.entityName) {
    const source = buildEntitySource(toolName, serverName, data);
    return source ? { sources: [source] } : undefined;
  }

  return undefined;
}
