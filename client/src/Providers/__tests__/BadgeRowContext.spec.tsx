// Deloitte Custom Change: tests

import React from 'react';
import { Tools } from 'librechat-data-provider';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthContext } from '~/hooks/AuthContext';
import BadgeRowProvider from '../BadgeRowContext';
import { ephemeralAgentByConvoId } from '~/store';

let mockAlwaysEnableFileSearch = false;
let mockCanUseFileSearch = true;
let mockFileSearchCapabilityEnabled = true;
// Deloitte Custom Change: exercise memory default authorization gates.
let mockCanUseMemory = true;
let mockMemoryCapabilityEnabled = true;
let mockMemoryOptOut = false;
let mockDefaultEnabledTools: string[] = [];
let mockInitialMemory = false;
let mockRolesLoaded = false;

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(() => ({
    data: {
      interface: {
        customDeloitteFeatureFlags: {
          alwaysEnableFileSearch: mockAlwaysEnableFileSearch,
          defaultEnabledTools: mockDefaultEnabledTools,
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
    useHasMemoryAccess: jest.fn(() => mockCanUseMemory),
    useAgentCapabilities: jest.fn(() => ({
      fileSearchEnabled: mockFileSearchCapabilityEnabled,
      memoryEnabled: mockMemoryCapabilityEnabled,
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
          set(ephemeralAgentByConvoId(conversationId), {
            [Tools.file_search]: false,
            ...(mockInitialMemory && { [Tools.memory]: true }),
          });
        }}
      >
        <AuthContext.Provider
          value={
            {
              user: { role: 'USER', personalization: { memories: !mockMemoryOptOut } },
              roles: mockRolesLoaded ? { USER: {} } : {},
              isAuthenticated: true,
            } as never
          }
        >
          <BadgeRowProvider conversationId={conversationId}>{children}</BadgeRowProvider>
        </AuthContext.Provider>
      </RecoilRoot>
    );
  };

describe('BadgeRowProvider file search force-enable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAlwaysEnableFileSearch = false;
    mockCanUseFileSearch = true;
    mockFileSearchCapabilityEnabled = true;
    mockCanUseMemory = true;
    mockMemoryCapabilityEnabled = true;
    mockMemoryOptOut = false;
    mockDefaultEnabledTools = [];
    mockInitialMemory = false;
    mockRolesLoaded = false;
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

  // Deloitte Custom Change: a seeded memory tool is cleared for unavailable access.
  it.each([
    ['memory permission is denied', () => (mockCanUseMemory = false)],
    ['memory endpoint capability is disabled', () => (mockMemoryCapabilityEnabled = false)],
    ['the user opted out of memory', () => (mockMemoryOptOut = true)],
  ])('turns off default-enabled memory when %s', async (_reason, configure) => {
    mockDefaultEnabledTools = ['memory'];
    mockInitialMemory = true;
    mockRolesLoaded = true;
    configure();

    const { result } = renderHook(() => useRecoilValue(ephemeralAgentByConvoId(conversationId)), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current?.[Tools.memory]).toBe(false);
    });
  });
});
