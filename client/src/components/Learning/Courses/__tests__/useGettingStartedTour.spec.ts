import { renderHook } from '@testing-library/react';
import useGettingStartedTour from '../useGettingStartedTour';

type DriverConfig = {
  onDestroyStarted?: () => void;
  onNextClick?: () => void;
  steps?: Array<{
    element: string;
    onHighlightStarted?: () => void;
    popover: {
      title: string;
      description: string;
      side: string;
    };
  }>;
};

const mockDrive = jest.fn();
const mockDestroy = jest.fn();
const mockMoveNext = jest.fn();
let mockIsLastStep = jest.fn();
let capturedConfig: DriverConfig | undefined;
let mockShowMarketplace = true;

jest.mock('~/hooks', () => ({
  useShowMarketplace: () => mockShowMarketplace,
}));

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
  beforeEach(() => {
    const conversationsButton = document.createElement('button');
    conversationsButton.id = 'nav-panel-conversations';
    conversationsButton.setAttribute('aria-pressed', 'true');
    document.body.appendChild(conversationsButton);

    const marketplaceButton = document.createElement('button');
    marketplaceButton.id = 'nav-agents-marketplace-button';
    document.body.appendChild(marketplaceButton);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockIsLastStep = jest.fn();
    capturedConfig = undefined;
    mockShowMarketplace = true;
    document.body.innerHTML = '';
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

  it('starts with the welcome step before new chat guidance', () => {
    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps?.[0]).toEqual({
      element: '#new-chat-button',
      popover: {
        title: 'Welcome to MyAssist',
        description:
          "Welcome to the new and improved MyAssist. We've rebuilt from the ground up to give you access to more powerful AI tools.<br><br>In this guided tour, we'll take you through the chat interface and side panel, so you are comfortable navigating through the platform.",
        side: 'right',
      },
    });
    expect(capturedConfig?.steps?.[1]?.popover.title).toBe('New Chat');
  });

  it('defines 26 steps and revisits the model selector to explain exiting an agent', () => {
    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps).toHaveLength(26);
    expect(
      capturedConfig?.steps?.slice(21, 25).map((step) => step.popover.title),
    ).toEqual(['Connectors', 'Agent Marketplace', 'Switch Back to a Model', 'Learning Hub']);
    expect(capturedConfig?.steps?.[22]?.onHighlightStarted).toBeDefined();
    expect(capturedConfig?.steps?.[23]?.onHighlightStarted).toBeDefined();
    expect(capturedConfig?.steps?.[23]).toEqual({
      element: '#model-selector-button',
      onHighlightStarted: expect.any(Function),
      popover: {
        title: 'Switch Back to a Model',
        description:
          'If you are using an agent and want to return to a general model, open this selector and choose a standard model instead.',
        side: 'bottom',
      },
    });
  });

  it('omits the marketplace step when the marketplace is hidden', () => {
    mockShowMarketplace = false;
    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps).toHaveLength(24);
    expect(
      capturedConfig?.steps?.some(
        (step) =>
          step.popover.title === 'Agent Marketplace' ||
          step.popover.title === 'Switch Back to a Model',
      ),
    ).toBe(false);
    expect(capturedConfig?.steps?.slice(21, 24).map((step) => step.popover.title)).toEqual([
      'Connectors',
      'Learning Hub',
      'Account Menu',
    ]);
  });

  it('omits agent-selection steps when the conversations panel target is unavailable', () => {
    document.body.innerHTML = '';
    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps).toHaveLength(24);
    expect(
      capturedConfig?.steps?.some(
        (step) =>
          step.popover.title === 'Agent Marketplace' ||
          step.popover.title === 'Switch Back to a Model',
      ),
    ).toBe(false);
  });

  it('omits agent-selection steps when the marketplace trigger is unavailable', () => {
    document.getElementById('nav-agents-marketplace-button')?.remove();
    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps).toHaveLength(24);
    expect(
      capturedConfig?.steps?.some(
        (step) =>
          step.popover.title === 'Agent Marketplace' ||
          step.popover.title === 'Switch Back to a Model',
      ),
    ).toBe(false);
  });
});
