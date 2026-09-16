import { act, renderHook } from '@testing-library/react';
import { useIsDarkMode } from '../useMCPIconMap';

jest.mock('@librechat/client', () => ({
  useTheme: () => ({ theme: 'system' }),
  isDark: () => false,
}));

let currentMatches = false;
let addEventListenerCalls = 0;
const listeners = new Set<() => void>();

beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    media: query,
    get matches() {
      return currentMatches;
    },
    addEventListener: (_event: string, cb: () => void) => {
      addEventListenerCalls += 1;
      listeners.add(cb);
    },
    removeEventListener: (_event: string, cb: () => void) => {
      listeners.delete(cb);
    },
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  currentMatches = false;
  addEventListenerCalls = 0;
  listeners.clear();
});

describe('useIsDarkMode (system theme)', () => {
  it('reflects the current system color-scheme preference on first render', () => {
    currentMatches = true;
    const { result, unmount } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(true);
    unmount();
  });

  it('updates when the system color-scheme preference changes', () => {
    const { result, unmount } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(false);

    currentMatches = true;
    act(() => {
      listeners.forEach((listener) => listener());
    });

    expect(result.current).toBe(true);
    unmount();
  });

  it('installs a single native change listener shared across multiple simultaneous instances', () => {
    // Regression test: caching the MediaQueryList object is not enough on its own —
    // each useSyncExternalStore subscriber must fan out from one shared listener,
    // otherwise a message with many citations installs one native listener each.
    const first = renderHook(() => useIsDarkMode());
    const second = renderHook(() => useIsDarkMode());
    const third = renderHook(() => useIsDarkMode());

    expect(addEventListenerCalls).toBe(1);

    first.unmount();
    second.unmount();
    third.unmount();
  });
});
