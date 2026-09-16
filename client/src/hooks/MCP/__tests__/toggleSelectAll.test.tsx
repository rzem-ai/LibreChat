import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { useMCPServerManager } from '../useMCPServerManager';

const mockShowToast = jest.fn();
jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({
    getQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
    refetchQueries: jest.fn(),
  }),
}));

const mockMutateAsync = jest.fn();
jest.mock('librechat-data-provider/react-query', () => ({
  useReinitializeMCPServerMutation: () => ({ mutateAsync: mockMutateAsync }),
  useCancelMCPOAuthMutation: () => ({ mutate: jest.fn() }),
  useUpdateUserPluginsMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  useGetAllEffectivePermissionsQuery: () => ({ data: {} }),
}));

let mockMcpValues: string[] = [];
const mockSetMCPValues = jest.fn((next: string[]) => {
  mockMcpValues = next;
});
let mockConnectionStatus: Record<string, { connectionState: string; requiresOAuth?: boolean }> = {};
let mockIsConnectionStatusLoading = false;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: () => true,
  useMCPSelect: () => ({
    isPinned: true,
    mcpValues: mockMcpValues,
    setIsPinned: jest.fn(),
    setMCPValues: mockSetMCPValues,
  }),
  useMCPConnectionStatus: () => ({
    connectionStatus: mockConnectionStatus,
    isConnectionStatusLoading: mockIsConnectionStatusLoading,
  }),
}));

let mockLoadedServers: Record<string, { chatMenu?: boolean; customUserVars?: unknown }> = {};
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: {} }),
  useMCPServersQuery: () => ({ data: mockLoadedServers, isLoading: false }),
}));

function makeServer(customUserVars?: Record<string, unknown>) {
  return { chatMenu: true, ...(customUserVars ? { customUserVars } : {}) };
}

function renderManager() {
  const store = createStore();
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );
  return renderHook(() => useMCPServerManager(), { wrapper: Wrapper });
}

describe('useMCPServerManager toggleSelectAll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMcpValues = [];
    mockConnectionStatus = {};
    mockIsConnectionStatusLoading = false;
    mockLoadedServers = {};
    mockMutateAsync.mockResolvedValue({ success: true });
  });

  // Deloitte Custom Change: covers the isConnectionStatusLoading bail-out in toggleSelectAll
  it('does nothing while the initial connectionStatus fetch is in flight', async () => {
    mockLoadedServers = { a: makeServer(), b: makeServer() };
    mockConnectionStatus = {};
    mockIsConnectionStatusLoading = true;

    const { result } = renderManager();

    await act(async () => {
      result.current.toggleSelectAll();
    });

    expect(mockMcpValues).toEqual([]);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('skips a connector that is already initializing locally, but still initializes the others', async () => {
    mockLoadedServers = { a: makeServer(), b: makeServer() };
    mockConnectionStatus = {
      a: { connectionState: 'disconnected' },
      b: { connectionState: 'disconnected' },
    };
    // 'a' never resolves, keeping isInitializing('a') true indefinitely.
    mockMutateAsync.mockImplementation((serverName: string) =>
      serverName === 'a' ? new Promise(() => {}) : Promise.resolve({ success: true }),
    );

    const { result, rerender } = renderManager();

    await act(async () => {
      result.current.initializeServer('a');
    });
    rerender();
    expect(result.current.isInitializing('a')).toBe(true);

    mockMutateAsync.mockClear();
    await act(async () => {
      result.current.toggleSelectAll();
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith('b');
  });

  it('skips connectors already connected or connecting', async () => {
    mockLoadedServers = { a: makeServer(), b: makeServer(), c: makeServer() };
    mockConnectionStatus = {
      a: { connectionState: 'connected' },
      b: { connectionState: 'connecting' },
      c: { connectionState: 'disconnected' },
    };

    const { result } = renderManager();

    await act(async () => {
      result.current.toggleSelectAll();
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith('c');
    expect(mockMcpValues).toEqual(['a', 'b', 'c']);
  });

  it('routes a connector with required custom user vars to the config dialog instead of initializing directly', async () => {
    mockLoadedServers = { a: makeServer({ apiKey: { title: 'API Key' } }) };
    mockConnectionStatus = { a: { connectionState: 'disconnected' } };

    const { result, rerender } = renderManager();

    await act(async () => {
      result.current.toggleSelectAll();
    });
    rerender();

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(result.current.isConfigModalOpen).toBe(true);
    expect(result.current.selectedToolForConfig?.name).toBe('a');
  });

  it('opens the config dialog for only the first of several connectors requiring custom user vars', async () => {
    mockLoadedServers = {
      a: makeServer({ apiKey: { title: 'API Key' } }),
      b: makeServer({ apiKey: { title: 'API Key' } }),
    };
    mockConnectionStatus = {
      a: { connectionState: 'disconnected' },
      b: { connectionState: 'disconnected' },
    };

    const { result, rerender } = renderManager();

    await act(async () => {
      result.current.toggleSelectAll();
    });
    rerender();

    // Only one dialog can be shown at a time; opening it for both would have silently
    // overwritten 'a' with 'b'. Confirms exactly one connector was prompted.
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(result.current.isConfigModalOpen).toBe(true);
    expect(result.current.selectedToolForConfig?.name).toBe('a');
    // 'b' was skipped rather than silently overwriting 'a' — surfaced via a toast so the
    // user knows it still needs individual configuration.
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_mcp_additional_config_required', status: 'info' }),
    );
  });

  it('continues initializing the remaining connectors when one fails (partial success)', async () => {
    mockLoadedServers = { a: makeServer(), b: makeServer() };
    mockConnectionStatus = {
      a: { connectionState: 'disconnected' },
      b: { connectionState: 'disconnected' },
    };
    mockMutateAsync.mockImplementation((serverName: string) =>
      serverName === 'a'
        ? Promise.resolve({ success: false, failureReason: 'unreachable' })
        : Promise.resolve({ success: true }),
    );

    const { result } = renderManager();

    await act(async () => {
      result.current.toggleSelectAll();
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    expect(mockMutateAsync).toHaveBeenCalledWith('a');
    expect(mockMutateAsync).toHaveBeenCalledWith('b');
  });

  it('does not duplicate an in-flight initialize on a rapid second Connect All click', async () => {
    mockLoadedServers = { a: makeServer() };
    mockConnectionStatus = { a: { connectionState: 'disconnected' } };
    mockMutateAsync.mockImplementation(() => new Promise(() => {}));

    const { result, rerender } = renderManager();

    await act(async () => {
      result.current.toggleSelectAll();
    });
    rerender();
    // First click selected everything, so a second click now sees "all selected" and
    // clears the selection instead of re-entering the initialize loop for 'a'.
    await act(async () => {
      result.current.toggleSelectAll();
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
