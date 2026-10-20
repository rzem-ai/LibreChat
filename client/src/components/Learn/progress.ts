import { useCallback, useEffect, useRef } from 'react';
import type { TTourProgress, TTourProgressUpdate } from 'librechat-data-provider';
import type { TourStatus, TourStep } from './content/schema';
import { useTutorialStateQuery, useUpdateTourProgressMutation } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { getCourse } from './content/registry';

/** Where progress lived before it moved to the user document; read once to migrate it. */
const LEGACY_STORAGE_KEY = 'learningTourProgress';

type TourProgressById = Record<string, TTourProgress>;
type SavedStep = Pick<TTourProgress, 'step' | 'stepId' | 'stepTitle'>;

export function getTourStatus(progress?: TTourProgress): { status: TourStatus; percent?: number } {
  if (progress?.completed) {
    return { status: 'complete' };
  }
  if (!progress || progress.step === 0) {
    return { status: 'not-started' };
  }
  return { status: 'in-progress', percent: Math.round((progress.step / progress.total) * 100) };
}

/**
 * Locates a saved step in the current full step list. Steps can be added, removed or
 * reordered between releases, so the id (then the title) wins over the saved position,
 * which is only the fallback for steps that never had either.
 */
export function findSavedStep(fullSteps: TourStep[], saved: SavedStep): number {
  const byId = saved.stepId ? fullSteps.findIndex((step) => step.id === saved.stepId) : -1;
  if (byId >= 0) {
    return byId;
  }
  const byTitle = saved.stepTitle
    ? fullSteps.findIndex((step) => step.title === saved.stepTitle)
    : -1;
  return byTitle >= 0 ? byTitle : saved.step;
}

/**
 * Maps a saved position in the full step list onto the steps available now, so resuming
 * lands on the same step (or the next available one) when conditional steps have changed.
 * Falls back to the start if nothing at or after the saved position is still available.
 */
export function resolveResumeIndex(
  fullSteps: TourStep[],
  activeSteps: TourStep[],
  savedStep: number,
): number {
  const index = activeSteps.findIndex((step) => fullSteps.indexOf(step) >= savedStep);
  return Math.max(index, 0);
}

export function toStepSnapshot(
  fullSteps: TourStep[],
  step: TourStep | undefined,
): Pick<TTourProgressUpdate, 'step' | 'total' | 'stepId' | 'stepTitle'> {
  return {
    step: Math.max(step ? fullSteps.indexOf(step) : 0, 0),
    total: fullSteps.length,
    stepId: step?.id,
    stepTitle: step?.title,
  };
}

function readLegacyProgress(): Record<string, Pick<TTourProgress, 'step' | 'completed'>> {
  try {
    return JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/** Per-tour progress stored on the user document, keyed by tour id. */
export default function useTourProgress() {
  const { isAuthenticated } = useAuthContext();
  const { data } = useTutorialStateQuery({ enabled: isAuthenticated });
  const { mutate } = useUpdateTourProgressMutation();

  const progressById: TourProgressById = data?.tutorialProgress ?? {};

  const recordStep = useCallback(
    (tourId: string, snapshot: Omit<TTourProgressUpdate, 'completed'>) =>
      mutate({ courseId: tourId, progress: { ...snapshot, completed: false } }),
    [mutate],
  );

  const recordComplete = useCallback(
    (tourId: string, total: number) =>
      mutate({
        courseId: tourId,
        progress: { step: total, total, completed: true },
      }),
    [mutate],
  );

  return { progressById, recordStep, recordComplete };
}

/**
 * One-time move of browser-stored progress to the user document. Tours the server already
 * knows about win; the browser copy is dropped once every upload has succeeded.
 * Mount once, so concurrent consumers of `useTourProgress` don't each upload.
 */
export function useMigrateLegacyProgress(): void {
  const { isAuthenticated } = useAuthContext();
  const { data, isSuccess } = useTutorialStateQuery({ enabled: isAuthenticated });
  const { mutateAsync } = useUpdateTourProgressMutation();
  const started = useRef(false);

  useEffect(() => {
    if (!isSuccess || started.current || window.localStorage.getItem(LEGACY_STORAGE_KEY) == null) {
      return;
    }
    started.current = true;

    const uploads = Object.entries(readLegacyProgress())
      .filter(([courseId]) => data?.tutorialProgress?.[courseId] == null)
      .map(([courseId, { step, completed }]) => {
        const fullSteps = getCourse(courseId)?.steps ?? [];
        if (fullSteps.length === 0) {
          return Promise.resolve();
        }
        const progress: TTourProgressUpdate = completed
          ? { step: fullSteps.length, total: fullSteps.length, completed }
          : { ...toStepSnapshot(fullSteps, fullSteps[step]), completed };
        return mutateAsync({ courseId, progress }).then(() => undefined);
      });

    Promise.all(uploads)
      .then(() => window.localStorage.removeItem(LEGACY_STORAGE_KEY))
      .catch(() => {
        started.current = false;
      });
  }, [data, isSuccess, mutateAsync]);
}
