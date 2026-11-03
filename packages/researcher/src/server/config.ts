import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { logger } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';
import type { TResearchConfig } from '../contract/research';
import { researchSchema } from '../contract/research';

/** The host's app config with the research section the package loads from `researcher.yaml`. */
export type ResearchAppConfig = AppConfig & { researcher?: TResearchConfig };

/** `RESEARCHER_CONFIG_PATH`, else `researcher.yaml` in the working directory (the project root). */
export function researchConfigPath(): string {
  return process.env.RESEARCHER_CONFIG_PATH || path.resolve(process.cwd(), 'researcher.yaml');
}

/**
 * Parses a research config document. Absent means the feature is off; an invalid document is
 * logged and treated as absent so a typo cannot take the app down. Accepts the section either
 * at the top level or under a `researcher:` key.
 */
export function parseResearchConfig(raw: unknown): TResearchConfig | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const section = 'researcher' in raw ? (raw as { researcher: unknown }).researcher : raw;
  const parsed = researchSchema.safeParse(section);
  if (!parsed.success) {
    logger.warn('[research] Invalid research config', parsed.error.flatten());
    return undefined;
  }
  return parsed.data;
}

/** Reads and parses `researcher.yaml`; undefined when the file is missing or invalid. */
export function loadResearchConfig(
  filePath: string = researchConfigPath(),
): TResearchConfig | undefined {
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch {
    logger.info(`[research] No research config at ${filePath}; research agents are disabled`);
    return undefined;
  }
  try {
    return parseResearchConfig(yaml.load(contents));
  } catch (error) {
    logger.warn(`[research] Could not parse ${filePath}`, error);
    return undefined;
  }
}

let cached: { config: TResearchConfig | undefined } | undefined;

/** The research config, read once per process. */
export function getResearchConfig(): TResearchConfig | undefined {
  cached ??= { config: loadResearchConfig() };
  return cached.config;
}

/** Overrides the cached config; `undefined` clears it so the next read reloads the file. */
export function setResearchConfig(config?: TResearchConfig): void {
  cached = config ? { config } : undefined;
}

/** The host's app config with the research section attached. */
export function withResearchConfig(appConfig: AppConfig): ResearchAppConfig {
  const research = getResearchConfig();
  return research ? { ...appConfig, researcher: research } : appConfig;
}
