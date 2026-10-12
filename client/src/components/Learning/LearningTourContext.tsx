import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { DESKTOP_START_DELAY_MS, SIDEBAR_TRANSITION_SYNC_MS } from './timing';
import useGettingStartedTour from './Courses/useGettingStartedTour';
import useTutorialPrompt from '~/hooks/Learning/useTutorialPrompt';
import { GETTING_STARTED_COURSE_ID } from './courses';
import { useActivePanel } from '~/Providers';
import store from '~/store';

interface LearningTourContextType {
  startGettingStartedTour: () => void;
  /** Set once the active tour reports completion; cleared by `dismissCompletion`. */
  completedCourseId: string | null;
  dismissCompletion: () => void;
}

const LearningTourContext = createContext<LearningTourContextType | undefined>(undefined);

/**
 * Mounted once in `Root`, above both the sidebar and the completion popup.
 * Starting the Getting Started tour switches the sidebar away from the Learning
 * Hub panel itself (to "conversations", so search/projects are visible) —
 * which would unmount any tour-completion state kept inside `LearningPanel`.
 * Owning that state here instead means the completion popup still shows up
 * no matter which panel is active when the tour finishes.
 */
export function LearningTourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { setActive } = useActivePanel();
  const [sidebarExpanded, setSidebarExpanded] = useRecoilState(store.sidebarExpanded);
  const [completedCourseId, setCompletedCourseId] = useState<string | null>(null);
  const { markPromptSeen } = useTutorialPrompt();

  // Capture the user's sidebar state before the tour starts so we can restore
  // it when the tour ends or is cancelled.
  const preTourSidebarExpandedRef = useRef<boolean>(false);

  const { startTour } = useGettingStartedTour(
    () => setCompletedCourseId(GETTING_STARTED_COURSE_ID),
    {
      // Restore sidebar to its pre-tour state when the tour ends/is cancelled.
      onEnd: () => setSidebarExpanded(preTourSidebarExpandedRef.current),
      setSidebarExpanded,
    },
  );

  // Track the pending delayed-start timeout so it can be cancelled on unmount.
  // Without this, a fast logout within the delay window would fire startTour()
  // after the provider (and the DOM it targets) has already torn down.
  const startTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (startTimeoutRef.current !== null) {
        window.clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    };
  }, []);

  const startGettingStartedTour = useCallback(() => {
    markPromptSeen();
    // Capture the user's current sidebar state so it can be restored when the
    // tour finishes or is cancelled — preTourSidebarExpanded is read by
    // useGettingStartedTour's onDestroyStarted callback via the ref.
    preTourSidebarExpandedRef.current = sidebarExpanded;

    // The tour highlights elements that only exist on the main chat route
    // (textarea, send button, header buttons) and inside the "conversations"
    // sidebar panel (search, projects) — switch to both before driving.
    navigate('/c/new');
    setActive('conversations');

    const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
    if (isSmallScreen) {
      // On mobile, collapse the sidebar so chat-area steps (0–6) are
      // unobstructed by the sidebar overlay. The tour will re-expand it
      // via onHighlightStarted when step 7 (Conversations) is reached.
      setSidebarExpanded(false);
    }
    // On desktop, leave the sidebar in whatever state the user had it — the
    // tour's onHighlightStarted will ensure it's expanded before step 7.

    startTimeoutRef.current = window.setTimeout(
      () => {
        startTimeoutRef.current = null;
        startTour();
      },
      isSmallScreen ? SIDEBAR_TRANSITION_SYNC_MS : DESKTOP_START_DELAY_MS,
    );
  }, [markPromptSeen, navigate, setActive, setSidebarExpanded, sidebarExpanded, startTour]);

  const dismissCompletion = useCallback(() => setCompletedCourseId(null), []);

  const value = useMemo(
    () => ({ startGettingStartedTour, completedCourseId, dismissCompletion }),
    [startGettingStartedTour, completedCourseId, dismissCompletion],
  );

  return <LearningTourContext.Provider value={value}>{children}</LearningTourContext.Provider>;
}

export function useLearningTour() {
  const context = useContext(LearningTourContext);
  if (context === undefined) {
    throw new Error('useLearningTour must be used within a LearningTourProvider');
  }
  return context;
}
