// Deloitte Custom Change: tests
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
  // Deloitte Custom Change: useMCPServerManager now gates on catalog warmup
  useCatalogReady: () => true,
}));

let mockLoadedServers: Record<string, { chatMenu?: boolean; customUserVars?: unknown }> = {};
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: {} }),
  useMCPServersQuery: () => ({ data: mockLoadedServers, isLoading: false }),
  // Deloitte Custom Change: useMCPServerManager now also queries discovered
  // MCP tools for authorization observation.
  useMCPToolsQuery: () => ({ data: undefined }),
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

describe('useMCPServerManager toggleServerSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMcpValues = [];
    mockConnectionStatus = {};
    mockIsConnectionStatusLoading = false;
    mockLoadedServers = {};
    mockMutateAsync.mockResolvedValue({ success: true });
  });

  it('checking a disconnected server both selects it and connects it (no separate plug-icon click needed)', async () => {
    mockLoadedServers = { a: makeServer() };
    mockConnectionStatus = { a: { connectionState: 'disconnected' } };

    const { result } = renderManager();

    await act(async () => {
      result.current.toggleServerSelection('a');
    });

    expect(mockMcpValues).toEqual(['a']);
    expect(mockMutateAsync).toHaveBeenCalledWith('a');
  });

  it('checking an already-connected server selects it without reinitializing', async () => {
    mockLoadedServers = { a: makeServer() };
    mockConnectionStatus = { a: { connectionState: 'connected' } };

    const { result } = renderManager();

    await act(async () => {
      result.current.toggleServerSelection('a');
    });

    expect(mockMcpValues).toEqual(['a']);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('ignores a checkbox click while the initial connectionStatus fetch is in flight', async () => {
    mockLoadedServers = { a: makeServer() };
    mockConnectionStatus = {};
    mockIsConnectionStatusLoading = true;

    const { result } = renderManager();

    await act(async () => {
      result.current.toggleServerSelection('a');
    });

    expect(mockMcpValues).toEqual([]);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('unchecking a selected server only deselects it, without disconnecting', async () => {
    mockLoadedServers = { a: makeServer() };
    mockConnectionStatus = { a: { connectionState: 'connected' } };
    mockMcpValues = ['a'];

    const { result } = renderManager();

    await act(async () => {
      result.current.toggleServerSelection('a');
    });

    expect(mockMcpValues).toEqual([]);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('routes a connector with required custom user vars to the config dialog instead of initializing directly', async () => {
    mockLoadedServers = { a: makeServer({ apiKey: { title: 'API Key' } }) };
    mockConnectionStatus = { a: { connectionState: 'disconnected' } };

    const { result, rerender } = renderManager();

    await act(async () => {
      result.current.toggleServerSelection('a');
    });
    rerender();

    expect(mockMcpValues).toEqual(['a']);
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(result.current.isConfigModalOpen).toBe(true);
    expect(result.current.selectedToolForConfig?.name).toBe('a');
  });

  it('ignores a checkbox click while the connector is already busy connecting', async () => {
    mockLoadedServers = { a: makeServer() };
    mockConnectionStatus = { a: { connectionState: 'connecting' } };

    const { result } = renderManager();

    await act(async () => {
      result.current.toggleServerSelection('a');
    });

    expect(mockMcpValues).toEqual([]);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
