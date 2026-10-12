import {
  filterMCPConfigByEntraGroups,
  filterMCPConfigForUser,
  isMCPConfigAllowedForGroups,
} from './access';

describe('filterMCPConfigByEntraGroups', () => {
  const mcpConfig = {
    unrestricted: { url: 'https://example.com' },
    sharepoint: {
      url: 'https://sharepoint.example.com',
      allowedEntraGroupIds: ['sharepoint-group'],
    },
  };

  it('keeps restricted servers for group members', () => {
    expect(filterMCPConfigByEntraGroups(mcpConfig, ['sharepoint-group'])).toEqual(mcpConfig);
  });

  it('removes restricted servers for non-members and unavailable memberships', () => {
    expect(filterMCPConfigByEntraGroups(mcpConfig, [])).toEqual({
      unrestricted: mcpConfig.unrestricted,
    });
  });

  it('resolves group memberships only for restricted configurations', async () => {
    const getEntraGroupIds = jest.fn().mockResolvedValue(['sharepoint-group']);

    await expect(filterMCPConfigForUser(mcpConfig, 'user-1', getEntraGroupIds)).resolves.toEqual(
      mcpConfig,
    );
    await expect(
      filterMCPConfigForUser({ unrestricted: mcpConfig.unrestricted }, 'user-1', getEntraGroupIds),
    ).resolves.toEqual({ unrestricted: mcpConfig.unrestricted });

    expect(getEntraGroupIds).toHaveBeenCalledTimes(1);
    expect(getEntraGroupIds).toHaveBeenCalledWith('user-1');
  });

  it('denies restricted servers when membership resolution fails', async () => {
    await expect(
      filterMCPConfigForUser(
        mcpConfig,
        'user-1',
        jest.fn().mockRejectedValue(new Error('unavailable')),
      ),
    ).resolves.toEqual({ unrestricted: mcpConfig.unrestricted });
  });

  it('checks a single protected server for runtime authorization', () => {
    expect(isMCPConfigAllowedForGroups(mcpConfig.sharepoint, ['other-group'])).toBe(false);
    expect(isMCPConfigAllowedForGroups(mcpConfig.sharepoint, ['sharepoint-group'])).toBe(true);
  });
});
