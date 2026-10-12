import { formatDisplayDate } from './format';

describe('formatDisplayDate', () => {
  it('formats an ISO date as "DD Mon YYYY"', () => {
    expect(formatDisplayDate('2025-11-06T00:00:00Z')).toBe('06 Nov 2025');
  });

  it('preserves an ISO timestamp without an offset as its written calendar date', () => {
    expect(formatDisplayDate('2009-04-24T21:15:04.683')).toBe('24 Apr 2009');
  });

  it('forces the September abbreviation to 3 letters, unlike en-GB\'s default "Sept"', () => {
    expect(formatDisplayDate('2026-09-03T12:00:00Z')).toBe('03 Sep 2026');
  });

  it('returns undefined for an unparseable value', () => {
    expect(formatDisplayDate('not a date')).toBeUndefined();
    expect(formatDisplayDate('2025-11-06Tnot-a-time')).toBeUndefined();
  });

  it('returns undefined when no value is given', () => {
    expect(formatDisplayDate(undefined)).toBeUndefined();
  });
});
