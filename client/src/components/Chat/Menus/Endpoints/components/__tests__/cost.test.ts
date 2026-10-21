import { isFreePricing } from '../cost';

const base = { tier: 1, isHighCost: false };

describe('isFreePricing', () => {
  it('is free when every billed rate is zero or absent', () => {
    expect(isFreePricing({ ...base, inputPer1M: 0, outputPer1M: 0 })).toBe(true);
    expect(
      isFreePricing({
        ...base,
        inputPer1M: 0,
        outputPer1M: 0,
        cacheReadPer1M: 0,
        cacheWritePer1M: 0,
      }),
    ).toBe(true);
  });

  it('is not free when input or output is billed', () => {
    expect(isFreePricing({ ...base, inputPer1M: 1, outputPer1M: 0 })).toBe(false);
    expect(isFreePricing({ ...base, inputPer1M: 0, outputPer1M: 1 })).toBe(false);
  });

  it('is not free when a cache rate is billed', () => {
    expect(isFreePricing({ ...base, inputPer1M: 0, outputPer1M: 0, cacheReadPer1M: 0.1 })).toBe(
      false,
    );
    expect(isFreePricing({ ...base, inputPer1M: 0, outputPer1M: 0, cacheWritePer1M: 0.1 })).toBe(
      false,
    );
  });

  it('is not free when pricing is unknown', () => {
    expect(isFreePricing(undefined)).toBe(false);
  });
});
