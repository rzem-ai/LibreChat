// Deloitte Custom Change: tests

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePinnedTool } from '../usePinnedTool';

/**
 * Integration tests for `usePinnedTool`, the pin-seeding logic shared by tool
 * toggles (extracted from `useToolToggle`) — exercised here directly against the
 * standalone hook used by native web search, with the REAL jsdom localStorage.
 */

let mockStartupConfig:
  | {
      interface?: {
        defaultPinnedTools?: string[];
        customDeloitteFeatureFlags?: { showToolsDropdown?: boolean };
      };
    }
  | undefined;

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(() => ({ data: mockStartupConfig })),
}));

const localStorageKey = 'TEST_NATIVE_WEB_SEARCH_TOGGLE_';
const pinKey = `${localStorageKey}pinned`;

const renderPinnedTool = () =>
  renderHook(() => usePinnedTool({ toolKey: 'native_web_search', localStorageKey }));

describe('usePinnedTool — defaultPinnedTools seeding (real localStorage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockStartupConfig = undefined;
  });

  it('applies the configured default once startupConfig resolves after mount (cold load)', async () => {
    mockStartupConfig = undefined;
    const { result, rerender } = renderPinnedTool();

    await waitFor(() => expect(result.current.isPinned).toBe(false));

    mockStartupConfig = { interface: { defaultPinnedTools: ['native_web_search'] } };
    rerender();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(true));
  });

  it('pins immediately when config is already cached at mount', async () => {
    mockStartupConfig = { interface: { defaultPinnedTools: ['native_web_search'] } };
    const { result } = renderPinnedTool();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
  });

  it('does not override an existing stored unpin preference', async () => {
    localStorage.setItem(pinKey, JSON.stringify(false));
    mockStartupConfig = { interface: { defaultPinnedTools: ['native_web_search'] } };
    const { result } = renderPinnedTool();

    await waitFor(() => expect(result.current.isPinned).toBe(false));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(false));
  });

  it('leaves the tool unpinned by default when it is not listed', async () => {
    mockStartupConfig = { interface: { defaultPinnedTools: ['artifacts'] } };
    const { result } = renderPinnedTool();

    await waitFor(() => expect(result.current.isPinned).toBe(false));
  });

  it('preserves a pin toggled before startupConfig resolves', async () => {
    mockStartupConfig = undefined;
    const { result, rerender } = renderPinnedTool();
    await waitFor(() => expect(result.current.isPinned).toBe(false));

    act(() => {
      result.current.setIsPinned(true);
    });
    await waitFor(() => expect(result.current.isPinned).toBe(true));

    mockStartupConfig = { interface: { defaultPinnedTools: ['artifacts'] } };
    rerender();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(true));
  });
});

describe('usePinnedTool — forced pin when showToolsDropdown is disabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockStartupConfig = undefined;
  });

  it('pins the tool even when localStorage has a stored false (cold load)', async () => {
    localStorage.setItem(pinKey, JSON.stringify(false));
    mockStartupConfig = undefined;
    const { result, rerender } = renderPinnedTool();

    await waitFor(() => expect(result.current.isPinned).toBe(false));

    mockStartupConfig = {
      interface: {
        defaultPinnedTools: ['native_web_search'],
        customDeloitteFeatureFlags: { showToolsDropdown: false },
      },
    };
    rerender();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(true));
  });

  it('unpins the tool when it is not in defaultPinnedTools and localStorage has a stored true', async () => {
    localStorage.setItem(pinKey, JSON.stringify(true));
    mockStartupConfig = {
      interface: {
        defaultPinnedTools: ['artifacts'],
        customDeloitteFeatureFlags: { showToolsDropdown: false },
      },
    };
    const { result } = renderPinnedTool();

    await waitFor(() => expect(result.current.isPinned).toBe(false));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(false));
  });
});
