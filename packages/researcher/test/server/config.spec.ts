import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig } from '@librechat/data-schemas';
import {
  getResearchConfig,
  setResearchConfig,
  loadResearchConfig,
  withResearchConfig,
  parseResearchConfig,
  researchConfigPath,
} from '../../src/server/config';

describe('research config', () => {
  let dir: string;
  const originalPath = process.env.RESEARCHER_CONFIG_PATH;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-config-'));
    setResearchConfig();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (originalPath === undefined) {
      delete process.env.RESEARCHER_CONFIG_PATH;
    } else {
      process.env.RESEARCHER_CONFIG_PATH = originalPath;
    }
    setResearchConfig();
  });

  const write = (contents: string): string => {
    const file = path.join(dir, 'researcher.yaml');
    fs.writeFileSync(file, contents);
    return file;
  };

  it('reads RESEARCHER_CONFIG_PATH, else researcher.yaml in the working directory', () => {
    delete process.env.RESEARCHER_CONFIG_PATH;
    expect(researchConfigPath()).toBe(path.resolve(process.cwd(), 'researcher.yaml'));
    process.env.RESEARCHER_CONFIG_PATH = '/etc/librechat/researcher.yaml';
    expect(researchConfigPath()).toBe('/etc/librechat/researcher.yaml');
  });

  it('fills defaults around the operator values, with or without a research key', () => {
    const nested = loadResearchConfig(
      write('research:\n  enabled: true\n  agents:\n    provider: bedrock\n    model: m\n'),
    );
    expect(nested?.enabled).toBe(true);
    expect(nested?.agents.provider).toBe('bedrock');
    expect(nested?.jobs.digest.maxItems).toBe(200);

    const flat = loadResearchConfig(write('enabled: true\nsnapshots:\n  retentionDays: 7\n'));
    expect(flat?.snapshots).toEqual({ retentionDays: 7, sweepHour: 3 });
  });

  it('treats a missing, unparsable or invalid file as research off', () => {
    expect(loadResearchConfig(path.join(dir, 'absent.yaml'))).toBeUndefined();
    expect(loadResearchConfig(write('research: [unclosed'))).toBeUndefined();
    expect(loadResearchConfig(write('research:\n  budgetDraftThreshold: 4\n'))).toBeUndefined();
    expect(parseResearchConfig(undefined)).toBeUndefined();
  });

  it('reads the file once and attaches the section to the app config', () => {
    process.env.RESEARCHER_CONFIG_PATH = write('research:\n  enabled: true\n');
    const appConfig = { fileStrategy: 'local' } as AppConfig;
    expect(withResearchConfig(appConfig).research?.enabled).toBe(true);

    fs.writeFileSync(process.env.RESEARCHER_CONFIG_PATH, 'research:\n  enabled: false\n');
    expect(getResearchConfig()?.enabled).toBe(true);

    setResearchConfig();
    expect(getResearchConfig()?.enabled).toBe(false);
  });

  it('leaves the app config alone when there is no research file', () => {
    process.env.RESEARCHER_CONFIG_PATH = path.join(dir, 'absent.yaml');
    const appConfig = { fileStrategy: 'local' } as AppConfig;
    expect(withResearchConfig(appConfig)).toBe(appConfig);
  });
});
