import { renderHook, act, waitFor } from '@testing-library/react';
import type { TTourProgress, TTutorialStateResponse } from 'librechat-data-provider';
import type { TourStep } from '../content/schema';
import useTourProgress, {
  findSavedStep,
  getTourStatus,
  resolveResumeIndex,
  toStepSnapshot,
  useMigrateLegacyProgress,
} from '../progress';
import { GETTING_STARTED_COURSE_ID, getCourseSteps } from '../content/registry';

const mockMutate = jest.fn();
const mockMutateAsync = jest.fn();
let mockState: Partial<TTutorialStateResponse> | undefined;
let mockIsSuccess = true;

jest.mock('~/data-provider', () => ({
  useTutorialStateQuery: () => ({ data: mockState, isSuccess: mockIsSuccess }),
  useUpdateTourProgressMutation: () => ({ mutate: mockMutate, mutateAsync: mockMutateAsync }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ isAuthenticated: true }),
}));

const LEGACY_KEY = 'learningTourProgress';
const progress = (overrides: Partial<TTourProgress> = {}): TTourProgress => ({
  step: 2,
  total: 9,
  completed: false,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockState = undefined;
  mockIsSuccess = true;
  mockMutateAsync.mockResolvedValue(undefined);
});

describe('getTourStatus', () => {
  it('is not-started without progress or before any step is passed', () => {
    expect(getTourStatus()).toEqual({ status: 'not-started' });
    expect(getTourStatus({ step: 0, total: 10, completed: false })).toEqual({
      status: 'not-started',
    });
  });

  it('reports a rounded percent while in progress', () => {
    expect(getTourStatus({ step: 6, total: 24, completed: false })).toEqual({
      status: 'in-progress',
      percent: 25,
    });
  });

  it('is complete once completed, regardless of step', () => {
    expect(getTourStatus({ step: 3, total: 24, completed: true })).toEqual({ status: 'complete' });
  });
});

describe('useTourProgress', () => {
  it('exposes the progress stored on the user', () => {
    mockState = { tutorialProgress: { 'tour-a': progress() } };
    const { result } = renderHook(() => useTourProgress());
    expect(result.current.progressById).toEqual({ 'tour-a': progress() });
  });

  it('defaults to no progress before the state loads', () => {
    const { result } = renderHook(() => useTourProgress());
    expect(result.current.progressById).toEqual({});
  });

  it('saves a step with its id and title', () => {
    const { result } = renderHook(() => useTourProgress());
    act(() =>
      result.current.recordStep('tour-a', {
        step: 2,
        total: 10,
        stepId: 'projects',
        stepTitle: 'Projects',
      }),
    );
    expect(mockMutate).toHaveBeenCalledWith({
      courseId: 'tour-a',
      progress: { step: 2, total: 10, stepId: 'projects', stepTitle: 'Projects', completed: false },
    });
  });

  it('saves completion at the final step', () => {
    const { result } = renderHook(() => useTourProgress());
    act(() => result.current.recordComplete('tour-a', 10));
    expect(mockMutate).toHaveBeenCalledWith({
      courseId: 'tour-a',
      progress: { step: 10, total: 10, completed: true },
    });
  });
});

describe('toStepSnapshot', () => {
  const step = (id: string): TourStep => ({
    id,
    element: `#${id}`,
    title: `T ${id}`,
    description: id,
  });
  const full = ['a', 'b', 'c'].map(step);

  it('captures the position, total, id and title of the step', () => {
    expect(toStepSnapshot(full, full[1])).toEqual({
      step: 1,
      total: 3,
      stepId: 'b',
      stepTitle: 'T b',
    });
  });

  it('falls back to the start when the step is unknown', () => {
    expect(toStepSnapshot(full, undefined)).toMatchObject({ step: 0, total: 3 });
  });
});

describe('findSavedStep', () => {
  const step = (id: string, title = id): TourStep => ({
    id,
    element: `#${id}`,
    title,
    description: id,
  });

  it('follows the step id when steps were inserted before it', () => {
    const full = [step('new'), step('a'), step('b')];
    expect(findSavedStep(full, { step: 1, stepId: 'b', stepTitle: 'b' })).toBe(2);
  });

  it('falls back to the title when the id is gone or was never set', () => {
    const full = [step('a'), { ...step('b2'), id: undefined, title: 'Projects' }];
    expect(findSavedStep(full, { step: 5, stepId: 'old', stepTitle: 'Projects' })).toBe(1);
  });

  it('falls back to the saved position when neither matches', () => {
    expect(findSavedStep([step('a'), step('b')], { step: 1, stepId: 'x', stepTitle: 'x' })).toBe(1);
    expect(findSavedStep([step('a'), step('b')], { step: 0 })).toBe(0);
  });
});

describe('useMigrateLegacyProgress', () => {
  const fullSteps = getCourseSteps(GETTING_STARTED_COURSE_ID);

  it('uploads browser progress the server lacks, then clears it', async () => {
    mockState = { tutorialProgress: {} };
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        [GETTING_STARTED_COURSE_ID]: { step: 2, total: fullSteps.length, completed: false },
        'retired-tour': { step: 1, total: 4, completed: false },
      }),
    );

    renderHook(() => useMigrateLegacyProgress());

    await waitFor(() => expect(localStorage.getItem(LEGACY_KEY)).toBeNull());
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      courseId: GETTING_STARTED_COURSE_ID,
      progress: {
        step: 2,
        total: fullSteps.length,
        stepId: fullSteps[2].id,
        stepTitle: fullSteps[2].title,
        completed: false,
      },
    });
  });

  it('uploads a completed tour without a step', async () => {
    mockState = { tutorialProgress: {} };
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ [GETTING_STARTED_COURSE_ID]: { step: 9, total: 9, completed: true } }),
    );

    renderHook(() => useMigrateLegacyProgress());

    await waitFor(() => expect(localStorage.getItem(LEGACY_KEY)).toBeNull());
    expect(mockMutateAsync).toHaveBeenCalledWith({
      courseId: GETTING_STARTED_COURSE_ID,
      progress: { step: fullSteps.length, total: fullSteps.length, completed: true },
    });
  });

  it('prefers progress the server already has', async () => {
    mockState = { tutorialProgress: { [GETTING_STARTED_COURSE_ID]: progress() } };
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ [GETTING_STARTED_COURSE_ID]: { step: 5, total: 9, completed: false } }),
    );

    renderHook(() => useMigrateLegacyProgress());

    await waitFor(() => expect(localStorage.getItem(LEGACY_KEY)).toBeNull());
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('keeps the browser copy when an upload fails', async () => {
    mockState = { tutorialProgress: {} };
    mockMutateAsync.mockRejectedValue(new Error('offline'));
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ [GETTING_STARTED_COURSE_ID]: { step: 2, total: 9, completed: false } }),
    );

    renderHook(() => useMigrateLegacyProgress());

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('waits for the server state before migrating', () => {
    mockIsSuccess = false;
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ [GETTING_STARTED_COURSE_ID]: { step: 2 } }));

    renderHook(() => useMigrateLegacyProgress());

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });
});

describe('resolveResumeIndex', () => {
  const step = (id: string): TourStep => ({ id, element: `#${id}`, title: id, description: id });
  const full = ['a', 'b', 'c', 'd', 'e'].map(step);

  it('resumes at the same step when every step is still available', () => {
    expect(resolveResumeIndex(full, full, 3)).toBe(3);
  });

  it('maps the saved position onto the filtered list when steps were removed', () => {
    const active = [full[0], full[1], full[3], full[4]];
    expect(resolveResumeIndex(full, active, 3)).toBe(2);
  });

  it('moves to the next available step when the saved step is gone', () => {
    const active = [full[0], full[1], full[3], full[4]];
    expect(resolveResumeIndex(full, active, 2)).toBe(2);
  });

  it('falls back to the start when nothing at or after the saved position remains', () => {
    expect(resolveResumeIndex(full, [full[0], full[1]], 4)).toBe(0);
  });
});
