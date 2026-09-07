import React from 'react';
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { LearningTourProvider, useLearningTour } from '../LearningTourContext';

const mockNavigate = jest.fn();
const mockSetActive = jest.fn();
const mockStartTour = jest.fn();
let capturedOnComplete: (() => void) | undefined;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('~/Providers', () => ({
  useActivePanel: () => ({ active: 'learning', setActive: mockSetActive }),
}));

jest.mock('../useLandingPageTour', () => ({
  __esModule: true,
  default: (onComplete?: () => void) => {
    capturedOnComplete = onComplete;
    return { startTour: mockStartTour };
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <LearningTourProvider>{children}</LearningTourProvider>;
}

describe('LearningTourContext', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('navigates to /c/new, switches to the conversations panel, then starts the tour', () => {
    const { result } = renderHook(() => useLearningTour(), { wrapper });

    act(() => {
      result.current.startLandingPageTour();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new');
    expect(mockSetActive).toHaveBeenCalledWith('conversations');

    act(() => {
      jest.runAllTimers();
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

    expect(result.current.completedCourseId).toBe('landing-page-buttons');

    act(() => {
      result.current.dismissCompletion();
    });
    expect(result.current.completedCourseId).toBeNull();
  });
});
