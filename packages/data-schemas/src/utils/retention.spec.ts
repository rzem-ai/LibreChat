import type { AppConfig } from '~/types';
import {
  getFileRetentionHours,
  getFileRetentionWarningHours,
  DEFAULT_FILE_RETENTION_WARNING_HOURS,
} from './retention';
import { MIN_RETENTION_HOURS, MAX_RETENTION_HOURS } from './tempChatRetention';

describe('getFileRetentionHours', () => {
  it('returns undefined when unconfigured, signaling conversation-inherited behavior', () => {
    expect(getFileRetentionHours()).toBeUndefined();
    expect(getFileRetentionHours({})).toBeUndefined();
  });

  it('returns the configured value when valid', () => {
    expect(getFileRetentionHours({ fileRetentionHours: 1440 })).toBe(1440);
  });

  it('clamps to the minimum when below range', () => {
    expect(getFileRetentionHours({ fileRetentionHours: 0 })).toBe(MIN_RETENTION_HOURS);
  });

  it('clamps to the maximum when above range', () => {
    expect(getFileRetentionHours({ fileRetentionHours: 100000 })).toBe(MAX_RETENTION_HOURS);
  });

  it('falls back to undefined on an invalid (non-numeric) value', () => {
    const config: Partial<AppConfig>['interfaceConfig'] = {
      fileRetentionHours: 'invalid' as unknown as number,
    };
    expect(getFileRetentionHours(config)).toBeUndefined();
  });
});

describe('getFileRetentionWarningHours', () => {
  it('returns the default when unconfigured', () => {
    expect(getFileRetentionWarningHours()).toBe(DEFAULT_FILE_RETENTION_WARNING_HOURS);
    expect(getFileRetentionWarningHours({})).toBe(DEFAULT_FILE_RETENTION_WARNING_HOURS);
  });

  it('returns the configured value when valid', () => {
    expect(getFileRetentionWarningHours({ fileRetentionWarningHours: 48 })).toBe(48);
  });

  it('clamps to the minimum when below range', () => {
    expect(getFileRetentionWarningHours({ fileRetentionWarningHours: 0 })).toBe(
      MIN_RETENTION_HOURS,
    );
  });

  it('clamps to the maximum when above range', () => {
    expect(getFileRetentionWarningHours({ fileRetentionWarningHours: 100000 })).toBe(
      MAX_RETENTION_HOURS,
    );
  });

  it('falls back to the default on an invalid (non-numeric) value', () => {
    const config: Partial<AppConfig>['interfaceConfig'] = {
      fileRetentionWarningHours: 'invalid' as unknown as number,
    };
    expect(getFileRetentionWarningHours(config)).toBe(DEFAULT_FILE_RETENTION_WARNING_HOURS);
  });
});
