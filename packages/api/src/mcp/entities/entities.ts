import type { MCPResultSource, MCPSourcesResult } from 'librechat-data-provider';

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

function buildEntitySource(
  toolName: string,
  serverName: string,
  entity: EntityRecord,
): MCPResultSource | undefined {
  if (!entity.entityName) {
    return undefined;
  }
  const metadataLines = [
    entity.entityID != null ? `Entity ID: ${entity.entityID}` : undefined,
    entity.lastApprovedDate ? `Last approved: ${entity.lastApprovedDate}` : undefined,
  ].filter(Boolean);
  return {
    toolName,
    serverName,
    title: entity.entityName,
    content: [entity.entityName, metadataLines.join('\n')].filter(Boolean).join('\n\n'),
  };
}

/**
 * Parses the DESC/GIMS entity search/list payload shape
 * (`{ data: { items: [{ entityID, entityName, lastApprovedDate }] } }`, or a
 * single entity directly under `data` for `get_entity_by_id`-style calls)
 * into one {@link MCPResultSource} per entity, so each citation can point at
 * the specific entity instead of the whole raw JSON blob. Returns undefined
 * (letting the caller fall back) when the content isn't this entity shape,
 * or no entity yields a usable name.
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
