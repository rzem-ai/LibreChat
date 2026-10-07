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
