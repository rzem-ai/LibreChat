import { useCallback } from 'react';
import type { TourProgress, TourStatus, TourStep } from './content/schema';
import useLocalStorage from '~/hooks/useLocalStorage';

const STORAGE_KEY = 'learningTourProgress';

export function getTourStatus(progress?: TourProgress): { status: TourStatus; percent?: number } {
  if (progress?.completed) {
    return { status: 'complete' };
  }
  if (!progress || progress.step === 0) {
    return { status: 'not-started' };
  }
  return { status: 'in-progress', percent: Math.round((progress.step / progress.total) * 100) };
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

/** Client-side tour progress, keyed by tour id. `step` is a position in the full step list. */
export default function useTourProgress() {
  const [progressById, setProgressById] = useLocalStorage<Record<string, TourProgress>>(
    STORAGE_KEY,
    {},
  );

  const recordStep = useCallback(
    (tourId: string, step: number, total: number) =>
      setProgressById({ ...progressById, [tourId]: { step, total, completed: false } }),
    [progressById, setProgressById],
  );

  const recordComplete = useCallback(
    (tourId: string, total: number) =>
      setProgressById({ ...progressById, [tourId]: { step: total, total, completed: true } }),
    [progressById, setProgressById],
  );

  return { progressById, recordStep, recordComplete };
}
