import { useCallback } from 'react';
import type { TourProgress, TourStatus } from './content/schema';
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

/** Client-side tour progress, keyed by tour id. `step` counts steps already passed. */
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
