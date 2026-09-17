import { renderHook } from '@testing-library/react';
import useTutorialPrompt from '../useTutorialPrompt';

const mockMutate = jest.fn();
let mockStartupConfig:
  | { interface?: { customDeloitteFeatureFlags?: { isTutorialEnabled?: boolean } } }
  | undefined = {
  interface: { customDeloitteFeatureFlags: { isTutorialEnabled: true } },
};
let mockTutorialQueryArgs: { enabled: boolean } | undefined;
let mockTutorialState: { tutorialPromptSeen: boolean } | undefined = {
  tutorialPromptSeen: false,
};
let mockIsAuthenticated = true;

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
  useTutorialStateQuery: (args: { enabled: boolean }) => {
    mockTutorialQueryArgs = args;
    return { data: mockTutorialState };
  },
  useUpdateTutorialStateMutation: () => ({ mutate: mockMutate }),
}));

describe('useTutorialPrompt', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockStartupConfig = { interface: { customDeloitteFeatureFlags: { isTutorialEnabled: true } } };
    mockTutorialQueryArgs = undefined;
    mockTutorialState = { tutorialPromptSeen: false };
    mockIsAuthenticated = true;
  });

  it('shows the prompt when enabled and not yet seen', () => {
    const { result } = renderHook(() => useTutorialPrompt());
    expect(result.current.shouldShowPrompt).toBe(true);
  });

  it('does not show the prompt once the user has already seen it', () => {
    mockTutorialState = { tutorialPromptSeen: true };
    const { result } = renderHook(() => useTutorialPrompt());
    expect(result.current.shouldShowPrompt).toBe(false);
  });

  it('does not show the prompt when the admin has disabled tutorials', () => {
    mockStartupConfig = { interface: { customDeloitteFeatureFlags: { isTutorialEnabled: false } } };
    const { result } = renderHook(() => useTutorialPrompt());
    expect(result.current.shouldShowPrompt).toBe(false);
  });

  it('waits for startup config before enabling the tutorial-state query', () => {
    mockStartupConfig = undefined;
    const { result } = renderHook(() => useTutorialPrompt());
    expect(result.current.shouldShowPrompt).toBe(false);
    expect(mockTutorialQueryArgs).toEqual({ enabled: false });
  });

  it('marks the prompt seen via the update mutation', () => {
    const { result } = renderHook(() => useTutorialPrompt());
    result.current.markPromptSeen();
    expect(mockMutate).toHaveBeenCalledWith({ tutorialPromptSeen: true });
  });
});
