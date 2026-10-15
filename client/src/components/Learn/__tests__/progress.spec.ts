import { renderHook, act } from '@testing-library/react';
import type { TourStep } from '../content/schema';
import useTourProgress, { getTourStatus, resolveResumeIndex } from '../progress';

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
  beforeEach(() => localStorage.clear());

  it('persists step progress and completion to localStorage', () => {
    const { result } = renderHook(() => useTourProgress());

    act(() => result.current.recordStep('tour-a', 2, 10));
    expect(result.current.progressById['tour-a']).toEqual({ step: 2, total: 10, completed: false });

    act(() => result.current.recordComplete('tour-a', 10));
    expect(JSON.parse(localStorage.getItem('learningTourProgress') ?? '{}')).toEqual({
      'tour-a': { step: 10, total: 10, completed: true },
    });
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
