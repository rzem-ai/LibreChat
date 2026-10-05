/** Deloitte Custom Change: maps a tool-name prefix to a citation-link URL template. Add an entry here to wire up a new integration's citation link — no other code changes are needed as long as the required fields are already available to the caller. */
export interface MCPLinkTemplate {
  /** Tool name prefix this template applies to, e.g. 'desc_'. */
  prefix: string;
  /** URL template with `{fieldName}` placeholders substituted from the fields passed to {@link resolveMCPSourceLink}, e.g. 'https://example.com/entities/{entityID}'. */
  template: string;
}

/**
 * No entry is added speculatively — each is only added once a real
 * integration's detail-page URL scheme is confirmed. Add a `{ prefix,
 * template }` entry to wire up a new one, e.g.
 * `{ prefix: 'desc_', template: 'https://.../{entityID}' }`.
 */
const MCP_LINK_TEMPLATES: MCPLinkTemplate[] = [
  {
    prefix: 'ibisworld_',
    template: 'https://my.ibisworld.com/{country}/en/industry-specialized/{code}/at-a-glance',
  },
];

/**
 * Resolves a citation link for `toolName` by finding the longest-prefix-matching
 * template (from `templates`, defaulting to {@link MCP_LINK_TEMPLATES}) — so
 * overlapping prefixes like `ibisworld_` and `ibisworld_report_` resolve
 * deterministically to the more specific one — then substituting `fields` into
 * its `{placeholder}`s. Returns undefined if no template matches this tool, or
 * if any placeholder the template needs has no corresponding field — a
 * partially-filled URL is worse than no link at all.
 */
export function resolveMCPSourceLink(
  toolName: string,
  fields: Record<string, string | number | undefined>,
  templates: MCPLinkTemplate[] = MCP_LINK_TEMPLATES,
): string | undefined {
  const matched = templates.reduce<MCPLinkTemplate | undefined>((longest, entry) => {
    if (!toolName.startsWith(entry.prefix)) {
      return longest;
    }
    return !longest || entry.prefix.length > longest.prefix.length ? entry : longest;
  }, undefined);
  if (!matched) {
    return undefined;
  }
  const placeholders = [...matched.template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
  if (
    placeholders.some((key) => {
      const value = fields[key];
      if (value == null) {
        return true;
      }
      if (typeof value === 'string') {
        return value.trim() === '';
      }
      return !Number.isFinite(value);
    })
  ) {
    return undefined;
  }
  return placeholders.reduce((url, key) => {
    const value = fields[key];
    const normalized = typeof value === 'string' ? value.trim() : value;
    return url.replaceAll(`{${key}}`, encodeURIComponent(String(normalized)));
  }, matched.template);
}
