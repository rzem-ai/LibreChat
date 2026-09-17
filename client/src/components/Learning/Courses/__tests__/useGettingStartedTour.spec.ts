import { renderHook } from '@testing-library/react';
import useGettingStartedTour from '../useGettingStartedTour';

type DriverConfig = {
  onDestroyStarted?: () => void;
  onNextClick?: () => void;
};

const mockDrive = jest.fn();
const mockDestroy = jest.fn();
const mockMoveNext = jest.fn();
let mockIsLastStep = jest.fn();
let capturedConfig: DriverConfig | undefined;

jest.mock('driver.js', () => ({
  driver: (config: DriverConfig) => {
    capturedConfig = config;
    return {
      drive: mockDrive,
      destroy: mockDestroy,
      moveNext: mockMoveNext,
      isLastStep: mockIsLastStep,
    };
  },
}));

describe('useGettingStartedTour', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockIsLastStep = jest.fn();
  });

  it('does not report completion when the tour is cancelled before the last step', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useGettingStartedTour(onComplete));
    result.current.startTour();

    mockIsLastStep.mockReturnValue(false);
    const onDestroyStarted = capturedConfig?.onDestroyStarted as () => void;
    onDestroyStarted();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not report completion when the tour is destroyed on the last step without Next', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useGettingStartedTour(onComplete));
    result.current.startTour();

    mockIsLastStep.mockReturnValue(true);
    const onDestroyStarted = capturedConfig?.onDestroyStarted as () => void;
    onDestroyStarted();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports completion when the last step is advanced with Next', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useGettingStartedTour(onComplete));
    result.current.startTour();

    mockIsLastStep.mockReturnValue(true);
    const onNextClick = capturedConfig?.onNextClick as () => void;
    const onDestroyStarted = capturedConfig?.onDestroyStarted as () => void;

    onNextClick();
    onDestroyStarted();

    expect(mockMoveNext).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
