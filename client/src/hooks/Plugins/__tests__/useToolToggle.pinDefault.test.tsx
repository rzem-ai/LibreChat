import React from 'react';
import { RecoilRoot } from 'recoil';
import { renderHook, act, waitFor } from '@testing-library/react';
import { LocalStorageKeys, Tools } from 'librechat-data-provider';
import { useToolToggle } from '../useToolToggle';

/**
 * Integration tests for the `defaultPinnedTools` pin-seeding logic in useToolToggle,
 * exercising the REAL useLocalStorageAlt + jsdom localStorage (not mocked).
 *
 * Focus: the cold-load race where startupConfig resolves AFTER the hook mounts, and
 * the guarantee that an existing stored pin preference is never overridden.
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
  useVerifyAgentToolAuth: jest.fn(() => ({ data: { authenticated: true } })),
  useGetStartupConfig: jest.fn(() => ({ data: mockStartupConfig })),
}));

jest.mock('~/utils/timestamps', () => ({
  setTimestamp: jest.fn(),
}));

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

const pinKey = `${LocalStorageKeys.LAST_CODE_TOGGLE_}pinned`;

const renderCodeToggle = () =>
  renderHook(
    () =>
      useToolToggle({
        toolKey: Tools.execute_code,
        localStorageKey: LocalStorageKeys.LAST_CODE_TOGGLE_,
        isAuthenticated: true,
      }),
    { wrapper: Wrapper },
  );

describe('useToolToggle — defaultPinnedTools seeding (real localStorage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockStartupConfig = undefined;
  });

  it('applies the configured default once startupConfig resolves after mount (cold load)', async () => {
    // Cold load: config not yet available when the hook mounts.
    mockStartupConfig = undefined;
    const { result, rerender } = renderCodeToggle();

    // No stored preference + config unresolved → unpinned.
    await waitFor(() => expect(result.current.isPinned).toBe(false));

    // Startup config arrives listing this tool.
    mockStartupConfig = { interface: { defaultPinnedTools: ['execute_code'] } };
    rerender();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(true));
  });

  it('pins immediately when config is already cached at mount', async () => {
    mockStartupConfig = { interface: { defaultPinnedTools: ['execute_code'] } };
    const { result } = renderCodeToggle();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
  });

  it('does not override an existing stored unpin preference (conservative)', async () => {
    localStorage.setItem(pinKey, JSON.stringify(false));
    mockStartupConfig = { interface: { defaultPinnedTools: ['execute_code'] } };
    const { result } = renderCodeToggle();

    // Give the apply-default effect a chance to (incorrectly) fire.
    await waitFor(() => expect(result.current.isPinned).toBe(false));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(false));
  });

  it('leaves a tool unpinned by default when it is not listed', async () => {
    mockStartupConfig = { interface: { defaultPinnedTools: ['artifacts'] } };
    const { result } = renderCodeToggle();

    await waitFor(() => expect(result.current.isPinned).toBe(false));
  });

  it('preserves a pin toggled before startupConfig resolves', async () => {
    // Cold load: user pins the tool before the config query resolves.
    mockStartupConfig = undefined;
    const { result, rerender } = renderCodeToggle();
    await waitFor(() => expect(result.current.isPinned).toBe(false));

    act(() => {
      result.current.setIsPinned(true);
    });
    await waitFor(() => expect(result.current.isPinned).toBe(true));

    // Config arrives WITHOUT this tool listed — the user's click must not be overwritten.
    mockStartupConfig = { interface: { defaultPinnedTools: ['artifacts'] } };
    rerender();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(true));
  });
});

/**
 * Tests for the showToolsDropdown=false forced-pin path.
 *
 * When showToolsDropdown is false users have no UI to pin/unpin tools, so
 * defaultPinnedTools is treated as a forced value that overrides whatever is in
 * localStorage. These tests also cover the race condition that existed in the
 * original fix: useLocalStorage reads a stale "false" from storage AFTER the
 * initial render already computed isPinned=true from a cached startupConfig,
 * then the old guard (appliedDefaultPin.current=true) prevented correction.
 */
describe('useToolToggle — forced pin when showToolsDropdown is disabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockStartupConfig = undefined;
  });

  it('pins the tool even when localStorage has a stored false (cold load)', async () => {
    localStorage.setItem(pinKey, JSON.stringify(false));
    mockStartupConfig = undefined;
    const { result, rerender } = renderCodeToggle();

    await waitFor(() => expect(result.current.isPinned).toBe(false));

    mockStartupConfig = {
      interface: {
        defaultPinnedTools: ['execute_code'],
        customDeloitteFeatureFlags: { showToolsDropdown: false },
      },
    };
    rerender();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(true));
  });

  it('pins the tool when config is already cached and localStorage has a stale false (race condition)', async () => {
    // Simulate the race: localStorage has "false" from a previous session, but
    // startupConfig is available immediately (React Query cache hit). The old
    // code would: useState(defaultPinned=true) → isPinned=true on first render,
    // mark appliedDefaultPin.current=true (no-op since they matched), then
    // useLocalStorage reads "false" → isPinned=false, but the guard blocked re-correction.
    localStorage.setItem(pinKey, JSON.stringify(false));
    mockStartupConfig = {
      interface: {
        defaultPinnedTools: ['execute_code'],
        customDeloitteFeatureFlags: { showToolsDropdown: false },
      },
    };
    const { result } = renderCodeToggle();

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
    const { result } = renderCodeToggle();

    await waitFor(() => expect(result.current.isPinned).toBe(false));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(false));
  });

  it('pins the tool when there is no stored value and the dropdown is hidden', async () => {
    mockStartupConfig = {
      interface: {
        defaultPinnedTools: ['execute_code'],
        customDeloitteFeatureFlags: { showToolsDropdown: false },
      },
    };
    const { result } = renderCodeToggle();

    await waitFor(() => expect(result.current.isPinned).toBe(true));
  });

  it('does not override stored preference when showToolsDropdown is true', async () => {
    localStorage.setItem(pinKey, JSON.stringify(false));
    mockStartupConfig = {
      interface: {
        defaultPinnedTools: ['execute_code'],
        customDeloitteFeatureFlags: { showToolsDropdown: true },
      },
    };
    const { result } = renderCodeToggle();

    await waitFor(() => expect(result.current.isPinned).toBe(false));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(false));
  });

  it('does not override stored preference when showToolsDropdown is absent', async () => {
    localStorage.setItem(pinKey, JSON.stringify(false));
    mockStartupConfig = {
      interface: {
        defaultPinnedTools: ['execute_code'],
      },
    };
    const { result } = renderCodeToggle();

    await waitFor(() => expect(result.current.isPinned).toBe(false));
    expect(localStorage.getItem(pinKey)).toBe(JSON.stringify(false));
  });
});
