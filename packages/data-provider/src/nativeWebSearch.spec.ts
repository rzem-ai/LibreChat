// Deloitte Custom Change: tests

import { modelSupportsNativeWebSearch } from './nativeWebSearch';

describe('modelSupportsNativeWebSearch', () => {
  it('is permissive when supportedModels is undefined', () => {
    expect(modelSupportsNativeWebSearch('gpt-4o', undefined)).toBe(true);
  });

  it('rejects every model when supportedModels is an explicit empty array', () => {
    expect(modelSupportsNativeWebSearch('gpt-4o', [])).toBe(false);
  });

  it('matches an exact model name', () => {
    expect(modelSupportsNativeWebSearch('gpt-4o', ['gpt-4o'])).toBe(true);
  });

  it('matches a dated snapshot by prefix', () => {
    expect(modelSupportsNativeWebSearch('gpt-4o-2024-08-06', ['gpt-4o'])).toBe(true);
  });

  it('rejects a prefix that does not end at a separator', () => {
    expect(modelSupportsNativeWebSearch('gpt-56-luna', ['gpt-5'])).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(modelSupportsNativeWebSearch('GPT-4O-2024-08-06', ['gpt-4o'])).toBe(true);
  });

  it('rejects a model not covered by any configured entry', () => {
    expect(modelSupportsNativeWebSearch('gpt-3.5-turbo', ['gpt-4o'])).toBe(false);
  });

  it('rejects when model is null/undefined but a list is configured', () => {
    expect(modelSupportsNativeWebSearch(undefined, ['gpt-4o'])).toBe(false);
    expect(modelSupportsNativeWebSearch(null, ['gpt-4o'])).toBe(false);
  });
});
