import { getConfigDefaults, RetentionMode } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import { loadDefaultInterface } from './interface';

describe('loadDefaultInterface', () => {
  it('uses the schema default for URL auto-submit when not configured', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.autoSubmitFromUrl).toBe(true);
  });

  it('preserves disabled URL auto-submit config', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        autoSubmitFromUrl: false,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.autoSubmitFromUrl).toBe(false);
  });

  it('preserves a disabled build info flag', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        buildInfo: false,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.buildInfo).toBe(false);
  });

  it('uses the schema default for build info when not configured', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.buildInfo).toBe(true);
  });

  it('preserves enabled build info config', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        buildInfo: true,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.buildInfo).toBe(true);
  });

  it('disables context cost by default', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.contextCost).toBe(false);
  });

  it('preserves a disabled context cost flag', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        contextCost: false,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.contextCost).toBe(false);
  });

  it('preserves enabled context cost config', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        contextCost: true,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.contextCost).toBe(true);
  });

  it('passes through a configured display currency', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        currency: { code: 'EUR', rate: 0.92 },
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.currency).toEqual({ code: 'EUR', rate: 0.92 });
  });

  it('omits currency when it is not configured', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.currency).toBeUndefined();
  });

  it('preserves enabled URL auto-submit config', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        autoSubmitFromUrl: true,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.autoSubmitFromUrl).toBe(true);
  });

  it('preserves disabled tutorial flag config', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        customDeloitteFeatureFlags: {
          isTutorialEnabled: false,
        },
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.customDeloitteFeatureFlags?.isTutorialEnabled).toBe(false);
  });

  it('maps the legacy tutorial flag into customDeloitteFeatureFlags during migration', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        isTutorialEnabled: false,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.customDeloitteFeatureFlags?.isTutorialEnabled).toBe(false);
  });

  it('uses the schema default for tutorial flag when not configured', async () => {
    const defaults = getConfigDefaults();
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: defaults,
    });

    expect(interfaceConfig?.customDeloitteFeatureFlags?.isTutorialEnabled).toBe(
      defaults.interface.customDeloitteFeatureFlags?.isTutorialEnabled,
    );
  });

  it('preserves the configured temporary chat retention period', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        temporaryChatRetention: 24,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.temporaryChatRetention).toBe(24);
  });

  it('omits temporary chat retention when it is not explicitly configured', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig).not.toHaveProperty('temporaryChatRetention');
  });

  it('preserves the configured agent file retention exemption', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        retentionMode: RetentionMode.ALL,
        retainAgentFiles: true,
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.retentionMode).toBe(RetentionMode.ALL);
    expect(interfaceConfig?.retainAgentFiles).toBe(true);
  });

  it('passes through configured default pinned tools', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        defaultPinnedTools: ['artifacts', 'execute_code', 'mcp'],
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.defaultPinnedTools).toEqual(['artifacts', 'execute_code', 'mcp']);
  });

  it('passes through the configured Deloitte header', async () => {
    const config: Partial<TCustomConfig> = {
      interface: {
        deloitteHeader: { enabled: true, title: 'MyAssist NextGenV2' },
      },
    };

    const interfaceConfig = await loadDefaultInterface({
      config,
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig?.deloitteHeader).toEqual({
      enabled: true,
      title: 'MyAssist NextGenV2',
    });
  });

  it('resolves environment variables in the configured Deloitte header title', async () => {
    const originalAppTitle = process.env.APP_TITLE;
    process.env.APP_TITLE = 'MyAssist NextGenV2';

    try {
      const config: Partial<TCustomConfig> = {
        interface: {
          deloitteHeader: { enabled: true, title: '${APP_TITLE}' },
        },
      };

      const interfaceConfig = await loadDefaultInterface({
        config,
        configDefaults: getConfigDefaults(),
      });

      expect(interfaceConfig?.deloitteHeader).toEqual({
        enabled: true,
        title: 'MyAssist NextGenV2',
      });
    } finally {
      if (originalAppTitle === undefined) {
        delete process.env.APP_TITLE;
      } else {
        process.env.APP_TITLE = originalAppTitle;
      }
    }
  });

  it('omits the Deloitte header when it is not explicitly configured', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig).not.toHaveProperty('deloitteHeader');
  });

  it('omits default pinned tools when not explicitly configured', async () => {
    const interfaceConfig = await loadDefaultInterface({
      config: {},
      configDefaults: getConfigDefaults(),
    });

    expect(interfaceConfig).not.toHaveProperty('defaultPinnedTools');
  });
});
