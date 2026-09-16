import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import useTutorialPrompt from '~/hooks/Learning/useTutorialPrompt';
import useLandingPageTour from './useLandingPageTour';
import { useActivePanel } from '~/Providers';
import store from '~/store';

const LANDING_PAGE_COURSE_ID = 'landing-page-buttons';
const DESKTOP_START_DELAY_MS = 200;
const MOBILE_START_DELAY_MS = 300;

interface LearningTourContextType {
  startLandingPageTour: () => void;
  /** Set once the active tour reports completion; cleared by `dismissCompletion`. */
  completedCourseId: string | null;
  dismissCompletion: () => void;
}

const LearningTourContext = createContext<LearningTourContextType | undefined>(undefined);

/**
 * Mounted once in `Root`, above both the sidebar and the completion popup.
 * Starting the landing-page tour switches the sidebar away from the Learning
 * Hub panel itself (to "conversations", so search/projects are visible) —
 * which would unmount any tour-completion state kept inside `LearningPanel`.
 * Owning that state here instead means the completion popup still shows up
 * no matter which panel is active when the tour finishes.
 */
export function LearningTourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { setActive } = useActivePanel();
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  const [completedCourseId, setCompletedCourseId] = useState<string | null>(null);
  const { markPromptSeen } = useTutorialPrompt();

  const { startTour } = useLandingPageTour(() => setCompletedCourseId(LANDING_PAGE_COURSE_ID));

  // Track the pending delayed-start timeout so it can be cancelled on unmount.
  // Without this, a fast logout within the delay window would fire startTour()
  // after the provider (and the DOM it targets) has already torn down.
  const startTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (startTimeoutRef.current !== null) {
        window.clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    };
  }, []);

  const startLandingPageTour = useCallback(() => {
    markPromptSeen();
    // The tour highlights elements that only exist on the main chat route
    // (textarea, send button, header buttons) and inside the "conversations"
    // sidebar panel (search, projects) — switch to both before driving.
    navigate('/c/new');
    setActive('conversations');
    const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
    if (isSmallScreen) {
      setSidebarExpanded(false);
    }
    startTimeoutRef.current = window.setTimeout(
      () => {
        startTimeoutRef.current = null;
        startTour();
      },
      isSmallScreen ? MOBILE_START_DELAY_MS : DESKTOP_START_DELAY_MS,
    );
  }, [markPromptSeen, navigate, setActive, setSidebarExpanded, startTour]);

  const dismissCompletion = useCallback(() => setCompletedCourseId(null), []);

  const value = useMemo(
    () => ({ startLandingPageTour, completedCourseId, dismissCompletion }),
    [startLandingPageTour, completedCourseId, dismissCompletion],
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
