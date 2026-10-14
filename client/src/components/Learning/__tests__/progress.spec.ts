import { renderHook, act } from '@testing-library/react';
import useTourProgress, { getTourStatus } from '../progress';

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
