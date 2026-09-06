import { renderHook } from '@testing-library/react';
import useTutorialPrompt from '../useTutorialPrompt';

const mockMutate = jest.fn();
let mockStartupConfig: { interface?: { isTutorialEnabled?: boolean } } = {
  interface: { isTutorialEnabled: true },
};
let mockTutorialState: { tutorialPromptSeen: boolean } | undefined = {
  tutorialPromptSeen: false,
};
let mockIsAuthenticated = true;

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
  useTutorialStateQuery: () => ({ data: mockTutorialState }),
  useUpdateTutorialStateMutation: () => ({ mutate: mockMutate }),
}));

describe('useTutorialPrompt', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockStartupConfig = { interface: { isTutorialEnabled: true } };
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
    mockStartupConfig = { interface: { isTutorialEnabled: false } };
    const { result } = renderHook(() => useTutorialPrompt());
    expect(result.current.shouldShowPrompt).toBe(false);
  });

  it('marks the prompt seen via the update mutation', () => {
    const { result } = renderHook(() => useTutorialPrompt());
    result.current.markPromptSeen();
    expect(mockMutate).toHaveBeenCalledWith({ tutorialPromptSeen: true });
  });
});
