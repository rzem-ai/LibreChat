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
import type { TourStep } from './content/schema';
import { GETTING_STARTED_COURSE_ID, getCourseSteps } from './content/registry';
import { TRANSITION_MS } from '~/components/UnifiedSidebar/constants';
import useTutorialPrompt from '~/hooks/Learning/useTutorialPrompt';
import useTourProgress, { resolveResumeIndex } from './progress';
import { hasAvailableTarget } from '~/utils/elements';
import useCourseTour from './Courses/useCourseTour';
import { DESKTOP_START_DELAY_MS } from './timing';
import { useActivePanel } from '~/Providers';
import { useShowMarketplace } from '~/hooks';
import store from '~/store';

interface LearningTourContextType {
  startGettingStartedTour: () => void;
  /** Starts the Getting Started tour at a saved zero-based step. */
  resumeGettingStartedTour: (savedStep: number) => void;
  /** Set once the active tour reports completion; cleared by `dismissCompletion`. */
  completedCourseId: string | null;
  dismissCompletion: () => void;
}

const LearningTourContext = createContext<LearningTourContextType | undefined>(undefined);

/** Getting Started step ids only shown once an agent can actually be selected. */
const CONDITIONAL_AGENT_STEP_IDS = new Set(['agent-marketplace', 'switch-back-to-model']);

/**
 * Mounted once in `Root`, above both the sidebar and the completion popup.
 * Starting the Getting Started tour switches the sidebar away from the Learning
 * Hub entry point (to "conversations", so search/projects are visible) —
 * which would unmount any tour-completion state kept inside the Learning menu.
 * Owning that state here instead means the completion popup still shows up
 * no matter which panel is active when the tour finishes.
 */
export function LearningTourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { setActive } = useActivePanel();
  const [sidebarExpanded, setSidebarExpanded] = useRecoilState(store.sidebarExpanded);
  const [completedCourseId, setCompletedCourseId] = useState<string | null>(null);
  const { markPromptSeen } = useTutorialPrompt();
  const showMarketplace = useShowMarketplace();
  const { recordStep, recordComplete } = useTourProgress();

  // Capture the user's sidebar state before the tour starts so we can restore
  // it when the tour ends or is cancelled.
  const preTourSidebarExpandedRef = useRef<boolean>(false);

  // Getting Started's agent-selection steps only make sense when the agent
  // marketplace feature is on and its nav targets actually exist — evaluated
  // fresh each time the tour starts, not at render time, since DOM targets
  // may not exist yet on an earlier render.
  const activeStepsRef = useRef<TourStep[]>([]);
  const getSteps = useCallback(() => {
    const canShowAgentSelectionSteps =
      showMarketplace &&
      hasAvailableTarget('#nav-panel-conversations') &&
      hasAvailableTarget('#nav-agents-marketplace-button');
    activeStepsRef.current = getCourseSteps(GETTING_STARTED_COURSE_ID).filter(
      (step) => !CONDITIONAL_AGENT_STEP_IDS.has(step.id ?? '') || canShowAgentSelectionSteps,
    );
    return activeStepsRef.current;
  }, [showMarketplace]);

  const { startTour } = useCourseTour(
    getSteps,
    () => {
      recordComplete(GETTING_STARTED_COURSE_ID, getCourseSteps(GETTING_STARTED_COURSE_ID).length);
      setCompletedCourseId(GETTING_STARTED_COURSE_ID);
    },
    {
      onStep: (index) => {
        const fullSteps = getCourseSteps(GETTING_STARTED_COURSE_ID);
        recordStep(
          GETTING_STARTED_COURSE_ID,
          fullSteps.indexOf(activeStepsRef.current[index]),
          fullSteps.length,
        );
      },
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

  const resumeGettingStartedTour = useCallback(
    (savedStep: number) => {
      markPromptSeen();
      // Capture the user's current sidebar state so it can be restored when the
      // tour finishes or is cancelled — preTourSidebarExpanded is read by
      // useCourseTour's onDestroyStarted callback via the ref.
      preTourSidebarExpandedRef.current = sidebarExpanded;

      // The tour highlights elements that only exist on the main chat route
      // (textarea, send button, header buttons) and inside the "conversations"
      // sidebar panel (search, projects) — switch to both before driving.
      navigate('/c/new');
      setActive('conversations');

      const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
      if (isSmallScreen) {
        // On mobile, collapse the sidebar so the early chat-area steps are
        // unobstructed by the sidebar overlay. The tour will re-expand it once
        // it reaches a step flagged `expandSidebarBefore` (see content/tours/getting-started.json).
        setSidebarExpanded(false);
      }
      // On desktop, leave the sidebar in whatever state the user had it — the
      // tour's onHighlightStarted will still expand it before the flagged step.

      startTimeoutRef.current = window.setTimeout(
        () => {
          const activeSteps = getSteps();
          const resumeIndex = resolveResumeIndex(
            getCourseSteps(GETTING_STARTED_COURSE_ID),
            activeSteps,
            savedStep,
          );
          const needsExpandedSidebar = activeSteps
            .slice(0, resumeIndex)
            .some((step) => step.expandSidebarBefore);
          if (!needsExpandedSidebar) {
            startTimeoutRef.current = null;
            startTour(resumeIndex);
            return;
          }
          // Resuming past a step that expands the sidebar skips that step's own expand
          // callback, so open it first and let its transition finish before driving.
          setSidebarExpanded(true);
          startTimeoutRef.current = window.setTimeout(() => {
            startTimeoutRef.current = null;
            startTour(resumeIndex);
          }, TRANSITION_MS);
        },
        isSmallScreen ? TRANSITION_MS : DESKTOP_START_DELAY_MS,
      );
    },
    [markPromptSeen, navigate, setActive, setSidebarExpanded, sidebarExpanded, startTour, getSteps],
  );

  const startGettingStartedTour = useCallback(
    () => resumeGettingStartedTour(0),
    [resumeGettingStartedTour],
  );

  const dismissCompletion = useCallback(() => setCompletedCourseId(null), []);

  const value = useMemo(
    () => ({
      startGettingStartedTour,
      resumeGettingStartedTour,
      completedCourseId,
      dismissCompletion,
    }),
    [startGettingStartedTour, resumeGettingStartedTour, completedCourseId, dismissCompletion],
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
