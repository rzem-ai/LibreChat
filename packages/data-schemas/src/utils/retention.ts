import type { FilterQuery } from 'mongoose';
import type { AppConfig } from '~/types';
import {
  DEFAULT_RETENTION_HOURS,
  MIN_RETENTION_HOURS,
  MAX_RETENTION_HOURS,
} from './tempChatRetention';
import logger from '~/config/winston';

export type RetentionFilterDocument = {
  isTemporary?: boolean | null;
  expiredAt?: Date | null;
};

export const activeExpirationFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date() } }],
  }) as FilterQuery<T>;

export const legacyPermanentExpirationFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> => ({ expiredAt: null }) as FilterQuery<T>;

export const buildRetentionVisibilityFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [
      { isTemporary: false, expiredAt: null },
      { isTemporary: false, expiredAt: { $gt: new Date() } },
      { isTemporary: null, expiredAt: null },
    ],
  }) as FilterQuery<T>;

export const createFallbackRetentionDate = (now: number = Date.now()): Date =>
  new Date(now + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);

/**
 * Default independent file-retention period in hours (60 days), used only when
 * `fileRetentionHours` is explicitly configured.
 */
export const DEFAULT_FILE_RETENTION_HOURS: number = 24 * 60; // 60 days

/**
 * Default lead time, in hours, before file expiry that the renewal prompt surfaces.
 */
export const DEFAULT_FILE_RETENTION_WARNING_HOURS: number = 24 * 7; // 7 days

/**
 * Resolves the independent file-retention period from config.
 * @returns the clamped retention hours, or `undefined` if `fileRetentionHours` is
 * unset, in which case files continue to inherit their conversation's retention.
 */
export function getFileRetentionHours(
  interfaceConfig?: AppConfig['interfaceConfig'] | null,
): number | undefined {
  const configValue = interfaceConfig?.fileRetentionHours;
  if (configValue === undefined) {
    return undefined;
  }

  if (typeof configValue !== 'number' || isNaN(configValue)) {
    logger.warn(`Invalid fileRetentionHours in config: ${configValue}. Ignoring.`);
    return undefined;
  }

  if (configValue < MIN_RETENTION_HOURS) {
    logger.warn(
      `File retention period ${configValue} is below minimum ${MIN_RETENTION_HOURS} hours. Using minimum value.`,
    );
    return MIN_RETENTION_HOURS;
  }

  if (configValue > MAX_RETENTION_HOURS) {
    logger.warn(
      `File retention period ${configValue} exceeds maximum ${MAX_RETENTION_HOURS} hours. Using maximum value.`,
    );
    return MAX_RETENTION_HOURS;
  }

  return configValue;
}

/**
 * Resolves how many hours before expiry the file-renewal prompt should surface.
 * Always returns a usable number, defaulting to {@link DEFAULT_FILE_RETENTION_WARNING_HOURS}.
 */
export function getFileRetentionWarningHours(
  interfaceConfig?: AppConfig['interfaceConfig'] | null,
): number {
  const configValue = interfaceConfig?.fileRetentionWarningHours;
  if (configValue === undefined) {
    return DEFAULT_FILE_RETENTION_WARNING_HOURS;
  }

  if (typeof configValue !== 'number' || isNaN(configValue)) {
    logger.warn(
      `Invalid fileRetentionWarningHours in config: ${configValue}. Using default: ${DEFAULT_FILE_RETENTION_WARNING_HOURS} hours.`,
    );
    return DEFAULT_FILE_RETENTION_WARNING_HOURS;
  }

  if (configValue < MIN_RETENTION_HOURS) {
    logger.warn(
      `File retention warning period ${configValue} is below minimum ${MIN_RETENTION_HOURS} hours. Using minimum value.`,
    );
    return MIN_RETENTION_HOURS;
  }

  if (configValue > MAX_RETENTION_HOURS) {
    logger.warn(
      `File retention warning period ${configValue} exceeds maximum ${MAX_RETENTION_HOURS} hours. Using maximum value.`,
    );
    return MAX_RETENTION_HOURS;
  }

  return configValue;
}

/**
 * Default independent agent/skill-retention period in hours (90 days), used when
 * `agentRetentionHours` is unset. Unlike files, agents/skills have no "inherit from
 * conversation" fallback state, so this always resolves to a concrete number.
 */
export const DEFAULT_AGENT_RETENTION_HOURS: number = 24 * 90; // 90 days

/**
 * Default lead time, in hours, before expiry that the agent/skill renewal prompt surfaces.
 */
export const DEFAULT_AGENT_RETENTION_WARNING_HOURS: number = 24 * 7; // 7 days

/**
 * Resolves the independent agent/skill-retention period from config. Always returns a
 * usable number, defaulting to {@link DEFAULT_AGENT_RETENTION_HOURS}.
 */
export function getAgentRetentionHours(
  interfaceConfig?: AppConfig['interfaceConfig'] | null,
): number {
  const configValue = interfaceConfig?.agentRetentionHours;
  if (configValue === undefined) {
    return DEFAULT_AGENT_RETENTION_HOURS;
  }

  if (typeof configValue !== 'number' || isNaN(configValue)) {
    logger.warn(
      `Invalid agentRetentionHours in config: ${configValue}. Using default: ${DEFAULT_AGENT_RETENTION_HOURS} hours.`,
    );
    return DEFAULT_AGENT_RETENTION_HOURS;
  }

  if (configValue < MIN_RETENTION_HOURS) {
    logger.warn(
      `Agent retention period ${configValue} is below minimum ${MIN_RETENTION_HOURS} hours. Using minimum value.`,
    );
    return MIN_RETENTION_HOURS;
  }

  if (configValue > MAX_RETENTION_HOURS) {
    logger.warn(
      `Agent retention period ${configValue} exceeds maximum ${MAX_RETENTION_HOURS} hours. Using maximum value.`,
    );
    return MAX_RETENTION_HOURS;
  }

  return configValue;
}

/**
 * Resolves how many hours before expiry the agent/skill-renewal prompt should surface.
 * Always returns a usable number, defaulting to {@link DEFAULT_AGENT_RETENTION_WARNING_HOURS}.
 */
export function getAgentRetentionWarningHours(
  interfaceConfig?: AppConfig['interfaceConfig'] | null,
): number {
  const configValue = interfaceConfig?.agentRetentionWarningHours;
  if (configValue === undefined) {
    return DEFAULT_AGENT_RETENTION_WARNING_HOURS;
  }

  if (typeof configValue !== 'number' || isNaN(configValue)) {
    logger.warn(
      `Invalid agentRetentionWarningHours in config: ${configValue}. Using default: ${DEFAULT_AGENT_RETENTION_WARNING_HOURS} hours.`,
    );
    return DEFAULT_AGENT_RETENTION_WARNING_HOURS;
  }

  if (configValue < MIN_RETENTION_HOURS) {
    logger.warn(
      `Agent retention warning period ${configValue} is below minimum ${MIN_RETENTION_HOURS} hours. Using minimum value.`,
    );
    return MIN_RETENTION_HOURS;
  }

  if (configValue > MAX_RETENTION_HOURS) {
    logger.warn(
      `Agent retention warning period ${configValue} exceeds maximum ${MAX_RETENTION_HOURS} hours. Using maximum value.`,
    );
    return MAX_RETENTION_HOURS;
  }

  return configValue;
}

/**
 * Default independent memory-retention period in hours (90 days), used when
 * `memoryRetentionHours` is unset. Like agents/skills, memories have no "inherit from
 * conversation" fallback state, so this always resolves to a concrete number.
 */
export const DEFAULT_MEMORY_RETENTION_HOURS: number = 24 * 90; // 90 days

/**
 * Resolves the independent memory-retention period from config. Always returns a
 * usable number, defaulting to {@link DEFAULT_MEMORY_RETENTION_HOURS}.
 */
export function getMemoryRetentionHours(
  interfaceConfig?: AppConfig['interfaceConfig'] | null,
): number {
  const configValue = interfaceConfig?.memoryRetentionHours;
  if (configValue === undefined) {
    return DEFAULT_MEMORY_RETENTION_HOURS;
  }

  if (typeof configValue !== 'number' || isNaN(configValue)) {
    logger.warn(
      `Invalid memoryRetentionHours in config: ${configValue}. Using default: ${DEFAULT_MEMORY_RETENTION_HOURS} hours.`,
    );
    return DEFAULT_MEMORY_RETENTION_HOURS;
  }

  if (configValue < MIN_RETENTION_HOURS) {
    logger.warn(
      `Memory retention period ${configValue} is below minimum ${MIN_RETENTION_HOURS} hours. Using minimum value.`,
    );
    return MIN_RETENTION_HOURS;
  }

  if (configValue > MAX_RETENTION_HOURS) {
    logger.warn(
      `Memory retention period ${configValue} exceeds maximum ${MAX_RETENTION_HOURS} hours. Using maximum value.`,
    );
    return MAX_RETENTION_HOURS;
  }

  return configValue;
}

/**
 * Default independent agent-file-retention period in hours (90 days), used when
 * `agentFileRetentionHours` is unset. Kept as its own constant/lever (separate from
 * {@link DEFAULT_AGENT_RETENTION_HOURS}) so the agent-attached-file clock and the owning
 * agent document's clock can be tuned independently.
 */
export const DEFAULT_AGENT_FILE_RETENTION_HOURS: number = 24 * 90; // 90 days

/**
 * Resolves the independent agent-file-retention period from config. Always returns a
 * usable number, defaulting to {@link DEFAULT_AGENT_FILE_RETENTION_HOURS}.
 */
export function getAgentFileRetentionHours(
  interfaceConfig?: AppConfig['interfaceConfig'] | null,
): number {
  const configValue = interfaceConfig?.agentFileRetentionHours;
  if (configValue === undefined) {
    return DEFAULT_AGENT_FILE_RETENTION_HOURS;
  }

  if (typeof configValue !== 'number' || isNaN(configValue)) {
    logger.warn(
      `Invalid agentFileRetentionHours in config: ${configValue}. Using default: ${DEFAULT_AGENT_FILE_RETENTION_HOURS} hours.`,
    );
    return DEFAULT_AGENT_FILE_RETENTION_HOURS;
  }

  if (configValue < MIN_RETENTION_HOURS) {
    logger.warn(
      `Agent file retention period ${configValue} is below minimum ${MIN_RETENTION_HOURS} hours. Using minimum value.`,
    );
    return MIN_RETENTION_HOURS;
  }

  if (configValue > MAX_RETENTION_HOURS) {
    logger.warn(
      `Agent file retention period ${configValue} exceeds maximum ${MAX_RETENTION_HOURS} hours. Using maximum value.`,
    );
    return MAX_RETENTION_HOURS;
  }

  return configValue;
}
