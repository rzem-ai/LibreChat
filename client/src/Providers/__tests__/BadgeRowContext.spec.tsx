// Deloitte Custom Change: tests

import React from 'react';
import { Tools } from 'librechat-data-provider';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { renderHook, waitFor } from '@testing-library/react';
import BadgeRowProvider from '../BadgeRowContext';
import { ephemeralAgentByConvoId } from '~/store';

let mockAlwaysEnableFileSearch = false;
let mockCanUseFileSearch = true;
let mockFileSearchCapabilityEnabled = true;

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(() => ({
    data: {
      interface: {
        customDeloitteFeatureFlags: {
          alwaysEnableFileSearch: mockAlwaysEnableFileSearch,
        },
      },
    },
  })),
}));

/** Deloitte Custom Change: stubbed out — the real hook requires a ChatContext, which this
 *  file-search spec doesn't provide. */
jest.mock('~/hooks/Plugins/useNativeWebSearchToggle', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    toggleState: false,
    debouncedChange: jest.fn(),
    isPinned: false,
    setIsPinned: jest.fn(),
    isSupported: false,
  })),
}));

jest.mock('~/hooks', () => {
  const { useRecoilState } = jest.requireActual('recoil');
  const { Constants } = jest.requireActual('librechat-data-provider');
  const { ephemeralAgentByConvoId } = jest.requireActual('~/store');

  return {
    useGetAgentsConfig: jest.fn(() => ({ agentsConfig: { capabilities: [] } })),
    useHasAccess: jest.fn(() => mockCanUseFileSearch),
    useAgentCapabilities: jest.fn(() => ({
      fileSearchEnabled: mockFileSearchCapabilityEnabled,
    })),
    useSearchApiKeyForm: jest.fn(() => ({
      setIsDialogOpen: jest.fn(),
      menuTriggerRef: { current: null },
      badgeTriggerRef: { current: null },
    })),
    useMCPServerManager: jest.fn(() => ({ availableMCPServers: [] })),
    useToolToggle: jest.fn(
      ({ conversationId, toolKey }: { conversationId?: string | null; toolKey: string }) => {
        const key = conversationId ?? Constants.NEW_CONVO;
        const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
        return {
          toggleState: ephemeralAgent?.[toolKey] ?? false,
          debouncedChange: jest.fn(),
          isPinned: false,
          setEphemeralAgent,
          ephemeralAgent,
        };
      },
    ),
  };
});

const conversationId = 'test-conversation';

const createWrapper = () =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <RecoilRoot
        initializeState={({ set }) => {
          set(ephemeralAgentByConvoId(conversationId), { [Tools.file_search]: false });
        }}
      >
        <BadgeRowProvider conversationId={conversationId}>{children}</BadgeRowProvider>
      </RecoilRoot>
    );
  };

describe('BadgeRowProvider file search force-enable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAlwaysEnableFileSearch = false;
    mockCanUseFileSearch = true;
    mockFileSearchCapabilityEnabled = true;
  });

  it('force-enables file_search when the feature flag is enabled for authorized users', async () => {
    mockAlwaysEnableFileSearch = true;

    const { result } = renderHook(() => useRecoilValue(ephemeralAgentByConvoId(conversationId)), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current?.[Tools.file_search]).toBe(true);
    });
  });

  it('does not force-enable file_search when FILE_SEARCH permission is denied', async () => {
    mockAlwaysEnableFileSearch = true;
    mockCanUseFileSearch = false;

    const { result } = renderHook(() => useRecoilValue(ephemeralAgentByConvoId(conversationId)), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current?.[Tools.file_search]).toBe(false);
    });
  });

  it('does not force-enable file_search when endpoint capability is disabled', async () => {
    mockAlwaysEnableFileSearch = true;
    mockFileSearchCapabilityEnabled = false;

    const { result } = renderHook(() => useRecoilValue(ephemeralAgentByConvoId(conversationId)), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current?.[Tools.file_search]).toBe(false);
    });
  });
});
