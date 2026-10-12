/** Deloitte Custom Change: Entra group-based MCP server authorization utilities. */
export type GroupRestrictedMCPConfig = {
  allowedEntraGroupIds?: readonly string[];
};

export type EntraGroupLookup = (userId: string) => Promise<readonly string[]>;

export function isMCPConfigAllowedForGroups(
  config: GroupRestrictedMCPConfig,
  userEntraGroupIds: readonly string[],
): boolean {
  const allowedGroups = config.allowedEntraGroupIds;
  return (
    !allowedGroups?.length || allowedGroups.some((groupId) => userEntraGroupIds.includes(groupId))
  );
}

/** Removes MCP servers the current user is not entitled to access. */
export function filterMCPConfigByEntraGroups<T extends object>(
  mcpConfig: Record<string, T>,
  userEntraGroupIds: readonly string[],
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(mcpConfig).filter(([, config]) =>
      isMCPConfigAllowedForGroups(config as GroupRestrictedMCPConfig, userEntraGroupIds),
    ),
  );
}

/** Resolves memberships only when a configured server requires them, denying restricted servers on failure. */
export async function filterMCPConfigForUser<T extends object>(
  mcpConfig: Record<string, T>,
  userId: string | undefined,
  getEntraGroupIds: EntraGroupLookup,
): Promise<Record<string, T>> {
  const hasRestrictedServer = Object.values(mcpConfig).some(
    (config) => (config as GroupRestrictedMCPConfig).allowedEntraGroupIds?.length,
  );
  if (!hasRestrictedServer) {
    return mcpConfig;
  }

  if (!userId) {
    return filterMCPConfigByEntraGroups(mcpConfig, []);
  }

  try {
    return filterMCPConfigByEntraGroups(mcpConfig, await getEntraGroupIds(userId));
  } catch {
    return filterMCPConfigByEntraGroups(mcpConfig, []);
  }
}
