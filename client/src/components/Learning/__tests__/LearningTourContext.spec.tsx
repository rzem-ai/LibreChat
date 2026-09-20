import React from 'react';
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { LearningTourProvider, useLearningTour } from '../LearningTourContext';

const mockNavigate = jest.fn();
const mockSetActive = jest.fn();
const mockSetSidebarExpanded = jest.fn();
const mockStartTour = jest.fn();
const mockMarkPromptSeen = jest.fn();
let capturedOnComplete: (() => void) | undefined;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('~/Providers', () => ({
  useActivePanel: () => ({ active: 'learning', setActive: mockSetActive }),
}));

jest.mock('recoil', () => ({
  useRecoilState: () => [false, mockSetSidebarExpanded],
  useSetRecoilState: () => mockSetSidebarExpanded,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { sidebarExpanded: 'sidebarExpanded' },
}));

jest.mock('../Courses/useGettingStartedTour', () => ({
  __esModule: true,
  default: (onComplete?: () => void) => {
    capturedOnComplete = onComplete;
    return { startTour: mockStartTour };
  },
}));

jest.mock('~/hooks/Learning/useTutorialPrompt', () => ({
  __esModule: true,
  default: () => ({ markPromptSeen: mockMarkPromptSeen }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <LearningTourProvider>{children}</LearningTourProvider>;
}

describe('LearningTourContext', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('navigates to /c/new, switches to the conversations panel, then starts the tour', () => {
    const { result } = renderHook(() => useLearningTour(), { wrapper });

    act(() => {
      result.current.startGettingStartedTour();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new');
    expect(mockSetActive).toHaveBeenCalledWith('conversations');
    expect(mockSetSidebarExpanded).not.toHaveBeenCalled();
    expect(mockMarkPromptSeen).toHaveBeenCalledTimes(1);

    act(() => {
      jest.runAllTimers();
    });
    expect(mockStartTour).toHaveBeenCalledTimes(1);
  });

  it('collapses the mobile sidebar and waits for the transition before starting the tour', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    const { result } = renderHook(() => useLearningTour(), { wrapper });

    act(() => {
      result.current.startGettingStartedTour();
    });

    expect(mockSetSidebarExpanded).toHaveBeenCalledWith(false);
    expect(mockMarkPromptSeen).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(mockStartTour).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockStartTour).toHaveBeenCalledTimes(1);
  });

  it('keeps completion state even though starting the tour switches away from the Learning panel', () => {
    // This is the bug this context fixes: completion state used to live inside
    // LearningPanel, which unmounts the moment the sidebar panel switches to
    // "conversations" — so the completion popup never had anywhere to read from.
    const { result } = renderHook(() => useLearningTour(), { wrapper });

    expect(result.current.completedCourseId).toBeNull();

    act(() => {
      capturedOnComplete?.();
    });

    expect(result.current.completedCourseId).toBe('getting-started-guide');

    act(() => {
      result.current.dismissCompletion();
    });
    expect(result.current.completedCourseId).toBeNull();
  });
});
