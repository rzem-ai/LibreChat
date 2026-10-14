import React from 'react';
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import type { TourStep } from '../content/schema';
import { LearningTourProvider, useLearningTour } from '../LearningTourContext';

const mockNavigate = jest.fn();
const mockSetActive = jest.fn();
const mockSetSidebarExpanded = jest.fn();
const mockStartTour = jest.fn();
const mockMarkPromptSeen = jest.fn();
let capturedOnComplete: (() => void) | undefined;
let capturedGetSteps: (() => TourStep[]) | undefined;
let mockShowMarketplace = true;
let mockAvailableTargets = new Set<string>();

// Fixture standing in for getting-started-guide.json's real content — only
// the two agent-selection steps and their ids matter for this file's tests.
const FIXTURE_STEPS: TourStep[] = [
  { element: '#new-chat-button', title: 'Welcome', description: 'welcome' },
  {
    id: 'agent-marketplace',
    element: '#nav-agents-marketplace-button',
    title: 'Agent Marketplace',
    description: 'am',
  },
  {
    id: 'switch-back-to-model',
    element: '#model-selector-button',
    title: 'Switch Back to a Model',
    description: 'sbtm',
  },
  { element: '#nav-user', title: 'Account Menu', description: 'account' },
];

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

jest.mock('~/hooks', () => ({
  useShowMarketplace: () => mockShowMarketplace,
}));

jest.mock('~/utils/elements', () => ({
  hasAvailableTarget: (selector: string) => mockAvailableTargets.has(selector),
}));

jest.mock('../content/registry', () => ({
  GETTING_STARTED_COURSE_ID: 'getting-started-guide',
  getCourseSteps: () => FIXTURE_STEPS,
}));

jest.mock('../Courses/useCourseTour', () => ({
  __esModule: true,
  default: (getSteps: () => TourStep[], onComplete?: () => void) => {
    capturedGetSteps = getSteps;
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
    mockShowMarketplace = true;
    mockAvailableTargets = new Set(['#nav-panel-conversations', '#nav-agents-marketplace-button']);
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

  describe('agent-selection step filtering', () => {
    it('includes the agent-selection steps when the marketplace and its targets are available', () => {
      renderHook(() => useLearningTour(), { wrapper });

      expect(capturedGetSteps?.().map((step) => step.title)).toEqual([
        'Welcome',
        'Agent Marketplace',
        'Switch Back to a Model',
        'Account Menu',
      ]);
    });

    it('omits the agent-selection steps when the marketplace is hidden', () => {
      mockShowMarketplace = false;
      renderHook(() => useLearningTour(), { wrapper });

      expect(capturedGetSteps?.().map((step) => step.title)).toEqual(['Welcome', 'Account Menu']);
    });

    it('omits the agent-selection steps when the conversations panel target is unavailable', () => {
      mockAvailableTargets.delete('#nav-panel-conversations');
      renderHook(() => useLearningTour(), { wrapper });

      expect(capturedGetSteps?.().map((step) => step.title)).toEqual(['Welcome', 'Account Menu']);
    });

    it('omits the agent-selection steps when the marketplace trigger is unavailable', () => {
      mockAvailableTargets.delete('#nav-agents-marketplace-button');
      renderHook(() => useLearningTour(), { wrapper });

      expect(capturedGetSteps?.().map((step) => step.title)).toEqual(['Welcome', 'Account Menu']);
    });
  });
});
