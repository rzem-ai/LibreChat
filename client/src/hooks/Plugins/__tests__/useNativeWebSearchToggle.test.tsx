// Deloitte Custom Change: tests

import { renderHook, act, waitFor } from '@testing-library/react';
import type { Agent, TConversation, TEndpointsConfig } from 'librechat-data-provider';
import useNativeWebSearchToggle from '../useNativeWebSearchToggle';

let mockConversation: Partial<TConversation> | null;
let mockEndpointsConfig: TEndpointsConfig | undefined;
let mockAgentData: Partial<Agent> | undefined;
let mockAgentsMap: Record<string, Partial<Agent>> | undefined;

const mockSetOptionValue = jest.fn();
const mockSetOption = jest.fn((key: string) => (value: unknown) => mockSetOptionValue(key, value));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: jest.fn(() => ({ data: mockEndpointsConfig })),
  useGetAgentByIdQuery: jest.fn(() => ({ data: mockAgentData })),
  useGetStartupConfig: jest.fn(() => ({ data: undefined })),
}));

jest.mock('~/Providers/ChatContext', () => ({
  useChatContext: () => ({ conversation: mockConversation }),
}));

jest.mock('~/Providers/AgentsMapContext', () => ({
  useAgentsMapContext: () => mockAgentsMap,
}));

jest.mock('~/hooks/Conversations/useSetIndexOptions', () => ({
  __esModule: true,
  default: () => ({ setOption: mockSetOption }),
}));

const OPENAI_ENDPOINT = 'openAI' as TConversation['endpoint'];
const AGENTS_ENDPOINT = 'agents' as TConversation['endpoint'];
const SUPPORTED_MODEL = 'gpt-6-luna';
const UNSUPPORTED_MODEL = 'gpt-41-nano';

describe('useNativeWebSearchToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockConversation = {
      endpoint: OPENAI_ENDPOINT,
      model: SUPPORTED_MODEL,
      web_search: false,
    };
    mockEndpointsConfig = undefined;
    mockAgentData = undefined;
    mockAgentsMap = undefined;
  });

  describe('support gating', () => {
    it('is permissive when the endpoint has no nativeWebSearch config', () => {
      const { result } = renderHook(() => useNativeWebSearchToggle());
      expect(result.current.isSupported).toBe(true);
    });

    it('is unsupported when supportedModels is an explicit empty list', () => {
      mockEndpointsConfig = {
        openAI: { nativeWebSearch: { supportedModels: [] } },
      } as unknown as TEndpointsConfig;

      const { result } = renderHook(() => useNativeWebSearchToggle());
      expect(result.current.isSupported).toBe(false);
    });

    it('follows the configured list for the conversation model', () => {
      mockEndpointsConfig = {
        openAI: { nativeWebSearch: { supportedModels: [SUPPORTED_MODEL] } },
      } as unknown as TEndpointsConfig;

      const { result, rerender } = renderHook(() => useNativeWebSearchToggle());
      expect(result.current.isSupported).toBe(true);

      mockConversation = {
        endpoint: OPENAI_ENDPOINT,
        model: UNSUPPORTED_MODEL,
        web_search: false,
      };
      rerender();
      expect(result.current.isSupported).toBe(false);
    });

    it('gates on the agent provider and model for the agents endpoint', () => {
      mockConversation = {
        endpoint: AGENTS_ENDPOINT,
        agent_id: 'agent-1',
        model: SUPPORTED_MODEL,
        web_search: false,
      };
      mockAgentData = { provider: 'openAI', model: UNSUPPORTED_MODEL };
      mockEndpointsConfig = {
        openAI: { nativeWebSearch: { supportedModels: [SUPPORTED_MODEL] } },
      } as unknown as TEndpointsConfig;

      const { result } = renderHook(() => useNativeWebSearchToggle());
      expect(result.current.isSupported).toBe(false);
    });
  });

  it('writes the model parameter as a boolean on change', () => {
    const { result } = renderHook(() => useNativeWebSearchToggle());

    act(() => {
      result.current.debouncedChange({ value: true });
    });

    expect(mockSetOption).toHaveBeenCalledWith('web_search');
    expect(mockSetOptionValue).toHaveBeenCalledWith('web_search', true);
  });

  describe('stale flag clearing', () => {
    it('clears a flag already set on an unsupported model at mount', async () => {
      mockConversation = {
        endpoint: OPENAI_ENDPOINT,
        model: UNSUPPORTED_MODEL,
        web_search: true,
      };
      mockEndpointsConfig = {
        openAI: { nativeWebSearch: { supportedModels: [SUPPORTED_MODEL] } },
      } as unknown as TEndpointsConfig;

      renderHook(() => useNativeWebSearchToggle());

      await waitFor(() => expect(mockSetOptionValue).toHaveBeenCalledWith('web_search', false));
    });

    it('leaves the flag alone while the model is supported', () => {
      mockConversation = {
        endpoint: OPENAI_ENDPOINT,
        model: SUPPORTED_MODEL,
        web_search: true,
      };
      mockEndpointsConfig = {
        openAI: { nativeWebSearch: { supportedModels: [SUPPORTED_MODEL] } },
      } as unknown as TEndpointsConfig;

      renderHook(() => useNativeWebSearchToggle());
      expect(mockSetOptionValue).not.toHaveBeenCalled();
    });
  });
});
