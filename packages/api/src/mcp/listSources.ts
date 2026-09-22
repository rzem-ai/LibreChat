import type { MCPResultSource } from 'librechat-data-provider';

/**
 * Deloitte Custom Change: shared "array of raw records → array of {@link MCPResultSource}"
 * skeleton used by connectors whose payload is a flat list (KX, AFR, SharePoint, DESC/GIMS
 * entities): slice to `maxItems`, map each item via `mapItem`, and drop items that don't map to a
 * usable source. Connector-specific field extraction, date parsing, and any extra per-item logic
 * stays in `mapItem`.
 */
export function buildListSources<T>({
  items,
  maxItems,
  mapItem,
}: {
  items: T[];
  maxItems: number;
  mapItem: (item: T) => MCPResultSource | undefined;
}): MCPResultSource[] {
  const sources: MCPResultSource[] = [];
  for (const item of items.slice(0, maxItems)) {
    const source = mapItem(item);
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}
