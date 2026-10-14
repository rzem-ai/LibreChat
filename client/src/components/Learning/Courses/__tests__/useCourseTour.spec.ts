import { act, fireEvent, renderHook, within } from '@testing-library/react';
import type { TourStep } from '../content/schema';
import { TRANSITION_MS } from '~/components/UnifiedSidebar/constants';
import useCourseTour from '../useCourseTour';

type FakeStep = {
  element: string;
  popover: { title: string; description: string; side?: string };
  expandSidebarBefore?: boolean;
};

type FakePopoverDom = {
  wrapper: HTMLElement;
  arrow: HTMLElement;
  title: HTMLElement;
  description: HTMLElement;
  footer: HTMLElement;
  progress: HTMLElement;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
};

type FakeDriverInstance = {
  drive: jest.Mock;
  destroy: jest.Mock;
  moveNext: jest.Mock;
  movePrevious: jest.Mock;
  refresh: jest.Mock;
  isLastStep: jest.Mock;
  getActiveIndex: jest.Mock;
};

type DriverConfig = {
  onDestroyStarted?: () => void;
  onHighlightStarted?: (element: HTMLElement | undefined, step: FakeStep) => void;
  onPopoverRender?: (
    popover: FakePopoverDom,
    opts: { driver: FakeDriverInstance; state: { activeIndex: number } },
  ) => void;
  steps?: FakeStep[];
};

/** Renders the popover for `steps[activeIndex]` — mirrors driver.js calling onPopoverRender. */
function renderPopoverForStep(popover: FakePopoverDom, activeIndex: number) {
  capturedConfig?.onPopoverRender?.(popover, {
    driver: mockDriverInstance!,
    state: { activeIndex },
  });
}

// Small, self-contained fixture — engine tests should never depend on real
// course content, so content changes can't break them (that's the point of
// splitting content from the engine).
const FIXTURE_STEPS: TourStep[] = [
  { element: '#step-one', title: 'Step One', description: 'First step', side: 'right' },
  {
    element: '#step-two',
    title: 'Step Two',
    description: 'Second step',
    side: 'bottom',
    expandSidebarBefore: true,
  },
  { element: '#step-three', title: 'Step Three', description: 'Third step', side: 'top' },
];

const mockDrive = jest.fn();
const mockDestroy = jest.fn();
const mockMoveNext = jest.fn();
const mockMovePrevious = jest.fn();
const mockRefresh = jest.fn();
const mockGetActiveIndex = jest.fn().mockReturnValue(0);
let mockIsLastStep = jest.fn();
let capturedConfig: DriverConfig | undefined;
let mockDriverInstance: FakeDriverInstance | undefined;

/**
 * Builds a minimal PopoverDOM-shaped object out of real DOM elements — our
 * onPopoverRender reads .style.display/.disabled off these (as driver.js
 * itself would have already set them) and appends a container to `wrapper`
 * to mount TourPopover into via createRoot + flushSync. title/description/
 * progress/nextButton are present only for shape parity with driver.js's
 * real PopoverDOM — their content is never read (see progressText/nextLabel
 * in useCourseTour.tsx, sourced from localize() instead).
 */
function createFakePopover(overrides: Partial<Record<string, string>> = {}): FakePopoverDom {
  const wrapper = document.createElement('div');
  const arrow = document.createElement('div');
  const title = document.createElement('header');
  const description = document.createElement('div');
  const footer = document.createElement('footer');
  const progress = document.createElement('span');
  const previousButton = document.createElement('button');
  const nextButton = document.createElement('button');
  const closeButton = document.createElement('button');

  title.innerHTML = overrides.title ?? 'Step Title';
  description.innerHTML = overrides.description ?? 'Step description';
  description.style.display = 'block';
  previousButton.disabled = overrides.previousDisabled === 'true';

  wrapper.appendChild(closeButton);
  wrapper.appendChild(arrow);
  wrapper.appendChild(title);
  wrapper.appendChild(description);
  wrapper.appendChild(footer);
  document.body.appendChild(wrapper);

  return {
    wrapper,
    arrow,
    title,
    description,
    footer,
    progress,
    previousButton,
    nextButton,
    closeButton,
  };
}

const mockLocalize = jest.fn((key: string) => key);

jest.mock('~/hooks', () => ({
  useLocalize: () => mockLocalize,
}));

jest.mock('driver.js', () => ({
  driver: (config: DriverConfig) => {
    capturedConfig = config;
    mockDriverInstance = {
      drive: mockDrive,
      destroy: mockDestroy,
      moveNext: mockMoveNext,
      movePrevious: mockMovePrevious,
      refresh: mockRefresh,
      isLastStep: mockIsLastStep,
      getActiveIndex: mockGetActiveIndex,
    };
    return mockDriverInstance;
  },
}));

describe('useCourseTour', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockGetActiveIndex.mockReturnValue(0);
    mockIsLastStep = jest.fn();
    capturedConfig = undefined;
    mockDriverInstance = undefined;
    document.body.innerHTML = '';
  });

  it('passes the provided steps through to driver.js', () => {
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS));
    result.current.startTour();

    expect(capturedConfig?.steps).toEqual([
      {
        element: '#step-one',
        popover: { title: 'Step One', description: 'First step', side: 'right' },
      },
      {
        element: '#step-two',
        popover: { title: 'Step Two', description: 'Second step', side: 'bottom' },
        expandSidebarBefore: true,
      },
      {
        element: '#step-three',
        popover: { title: 'Step Three', description: 'Third step', side: 'top' },
      },
    ]);
  });

  it('expands the sidebar when the current step is flagged expandSidebarBefore', () => {
    const setSidebarExpanded = jest.fn();
    const { result } = renderHook(() =>
      useCourseTour(() => FIXTURE_STEPS, undefined, { setSidebarExpanded }),
    );
    result.current.startTour();

    const flaggedStep = capturedConfig?.steps?.[1] as FakeStep;
    capturedConfig?.onHighlightStarted?.(undefined, flaggedStep);
    expect(setSidebarExpanded).toHaveBeenCalledWith(true);

    setSidebarExpanded.mockClear();
    const unflaggedStep = capturedConfig?.steps?.[0] as FakeStep;
    capturedConfig?.onHighlightStarted?.(undefined, unflaggedStep);
    expect(setSidebarExpanded).not.toHaveBeenCalled();
  });

  it('re-measures only after the sidebar transition finishes, not immediately', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useCourseTour(() => FIXTURE_STEPS, undefined, { setSidebarExpanded: jest.fn() }),
    );
    result.current.startTour();

    const flaggedStep = capturedConfig?.steps?.[1] as FakeStep;
    capturedConfig?.onHighlightStarted?.(undefined, flaggedStep);
    expect(mockRefresh).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(TRANSITION_MS - 1);
    });
    expect(mockRefresh).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('cancels the pending re-measure if the tour ends before the transition finishes', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useCourseTour(() => FIXTURE_STEPS, undefined, { setSidebarExpanded: jest.fn() }),
    );
    result.current.startTour();

    const flaggedStep = capturedConfig?.steps?.[1] as FakeStep;
    capturedConfig?.onHighlightStarted?.(undefined, flaggedStep);
    capturedConfig?.onDestroyStarted?.();

    act(() => {
      jest.advanceTimersByTime(TRANSITION_MS);
    });
    expect(mockRefresh).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not report completion when the tour is cancelled before the last step', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS, onComplete));
    result.current.startTour();

    mockIsLastStep.mockReturnValue(false);
    const onDestroyStarted = capturedConfig?.onDestroyStarted as () => void;
    onDestroyStarted();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not report completion when the tour is destroyed on the last step without Next', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS, onComplete));
    result.current.startTour();

    mockIsLastStep.mockReturnValue(true);
    const onDestroyStarted = capturedConfig?.onDestroyStarted as () => void;
    onDestroyStarted();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports completion when the last step is advanced with Next', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS, onComplete));
    result.current.startTour();

    mockIsLastStep.mockReturnValue(true);
    const popover = createFakePopover();
    act(() => {
      renderPopoverForStep(popover, 0);
    });

    fireEvent.click(within(popover.wrapper).getByText('com_ui_done'));
    const onDestroyStarted = capturedConfig?.onDestroyStarted as () => void;
    act(() => {
      onDestroyStarted();
    });

    expect(mockMoveNext).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows the localized Next label before the last step and Done on the last step', () => {
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS));
    result.current.startTour();

    mockIsLastStep.mockReturnValue(false);
    const midPopover = createFakePopover();
    act(() => {
      renderPopoverForStep(midPopover, 0);
    });
    expect(within(midPopover.wrapper).getByText('com_ui_next')).toBeInTheDocument();

    mockIsLastStep.mockReturnValue(true);
    const lastPopover = createFakePopover();
    act(() => {
      renderPopoverForStep(lastPopover, 2);
    });
    expect(within(lastPopover.wrapper).getByText('com_ui_done')).toBeInTheDocument();
  });

  it('localizes the step progress text with the 1-based current step and total', () => {
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS));
    result.current.startTour();

    mockGetActiveIndex.mockReturnValue(1);
    const popover = createFakePopover();
    act(() => {
      renderPopoverForStep(popover, 1);
    });

    expect(mockLocalize).toHaveBeenCalledWith('com_learning_tour_progress', {
      0: 2,
      1: FIXTURE_STEPS.length,
    });
  });

  it("moves to the previous step when TourPopover's Previous button is clicked", () => {
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS));
    result.current.startTour();

    const popover = createFakePopover({ previousDisabled: 'false' });
    act(() => {
      renderPopoverForStep(popover, 0);
    });

    fireEvent.click(within(popover.wrapper).getByText('com_learning_tour_previous'));

    expect(mockMovePrevious).toHaveBeenCalledTimes(1);
  });

  it('disables the Previous button on the first step', () => {
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS));
    result.current.startTour();

    const popover = createFakePopover({ previousDisabled: 'true' });
    act(() => {
      renderPopoverForStep(popover, 0);
    });

    expect(within(popover.wrapper).getByText('com_learning_tour_previous')).toBeDisabled();
  });

  it("renders the active step's own title and description, not driver.js's rendered copy", () => {
    const { result } = renderHook(() => useCourseTour(() => FIXTURE_STEPS));
    result.current.startTour();

    // The fake popover's own title/description DOM nodes carry unrelated text —
    // TourPopover should render FIXTURE_STEPS[1]'s content regardless, since it
    // now comes from the step data directly rather than from these nodes.
    const popover = createFakePopover({ title: 'unrelated', description: 'unrelated' });
    act(() => {
      renderPopoverForStep(popover, 1);
    });

    // Scope to the appended container TourPopover renders into — driver.js's
    // own (now hidden, but still present) title/description elements also
    // match by text, since getByText matches hidden elements by default.
    const renderedContainer = popover.wrapper.lastElementChild as HTMLElement;
    expect(within(renderedContainer).getByText('Step Two')).toBeInTheDocument();
    expect(within(renderedContainer).getByText('Second step')).toBeInTheDocument();
  });
});
