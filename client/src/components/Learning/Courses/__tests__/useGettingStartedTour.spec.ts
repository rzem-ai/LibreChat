import { renderHook } from '@testing-library/react';
import useGettingStartedTour from '../useGettingStartedTour';

type DriverConfig = {
  onDestroyStarted?: () => void;
  onNextClick?: () => void;
  steps?: Array<{
    element: string;
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

function appendAnchor(
  tagName: keyof HTMLElementTagNameMap,
  options: { id?: string; testId?: string; ariaPressed?: string } = {},
) {
  const element = document.createElement(tagName);
  if (options.id) {
    element.id = options.id;
  }
  if (options.testId) {
    element.setAttribute('data-testid', options.testId);
  }
  if (options.ariaPressed) {
    element.setAttribute('aria-pressed', options.ariaPressed);
  }
  document.body.appendChild(element);
}

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
    appendAnchor('button', { id: 'new-chat-button' });
    appendAnchor('button', { id: 'model-selector-button' });
    appendAnchor('div', { id: 'prompt-textarea' });
    appendAnchor('button', { id: 'attach-file-menu-button' });
    appendAnchor('button', { id: 'toolbar-toggle-code-interpreter' });
    appendAnchor('button', { id: 'toolbar-toggle-skills' });
    appendAnchor('button', { id: 'toolbar-toggle-artifacts' });
    appendAnchor('button', { id: 'toolbar-toggle-mcp-servers' });
    appendAnchor('button', { id: 'send-button' });
    appendAnchor('button', { id: 'close-sidebar-button' });
    appendAnchor('button', { id: 'nav-panel-conversations', ariaPressed: 'true' });
    appendAnchor('div', { id: 'nav-projects-section' });
    appendAnchor('button', { id: 'nav-panel-agents' });
    appendAnchor('button', { id: 'nav-panel-skills' });
    appendAnchor('button', { id: 'nav-panel-prompts' });
    appendAnchor('button', { id: 'nav-panel-memories' });
    appendAnchor('button', { id: 'nav-panel-files' });
    appendAnchor('button', { id: 'nav-panel-parameters' });
    appendAnchor('button', { id: 'nav-panel-mcp-builder' });
    appendAnchor('button', { id: 'nav-agents-marketplace-button' });
    appendAnchor('button', { id: 'nav-panel-learning' });
    appendAnchor('button', { id: 'nav-user' });
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

  it('starts with the merged welcome / new chat step', () => {
    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps?.[0]).toEqual({
      element: '#new-chat-button',
      popover: {
        title: 'Welcome to MyAssist',
        description:
          "Welcome to the new and improved MyAssist! We've rebuilt from the ground up to give you access to more powerful AI tools, and this guided tour will get you comfortable navigating the chat interface and side panel.<br><br>This button starts a brand new conversation any time — your current chat is saved automatically, so nothing is lost.",
        side: 'right',
      },
    });
    expect(capturedConfig?.steps?.[1]?.popover.title).toBe('Model');
  });

  it('defines 16 steps and revisits the model selector to explain exiting an agent', () => {
    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps).toHaveLength(16);
    expect(capturedConfig?.steps?.slice(9, 12).map((step) => step.popover.title)).toEqual([
      'Agent Builder',
      'Agent Marketplace',
      'Switch Back to a Model',
    ]);
    expect(capturedConfig?.steps?.[11]).toEqual({
      element: '#model-selector-button',
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

    expect(capturedConfig?.steps).toHaveLength(14);
    expect(
      capturedConfig?.steps?.some(
        (step) =>
          step.popover.title === 'Agent Marketplace' ||
          step.popover.title === 'Switch Back to a Model',
      ),
    ).toBe(false);
    expect(capturedConfig?.steps?.slice(11, 14).map((step) => step.popover.title)).toEqual([
      'Personalize & Manage',
      'MyAssist Academy',
      'Account Menu',
    ]);
  });

  it('omits agent-selection steps when the conversations panel target is unavailable', () => {
    document.getElementById('nav-panel-conversations')?.remove();
    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps).toHaveLength(14);
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

    expect(capturedConfig?.steps).toHaveLength(14);
    expect(
      capturedConfig?.steps?.some(
        (step) =>
          step.popover.title === 'Agent Marketplace' ||
          step.popover.title === 'Switch Back to a Model',
      ),
    ).toBe(false);
  });

  it('retains the Send step even when the send button is disabled', () => {
    // On a blank /c/new conversation the send button is always disabled — the
    // step explains this to the user ("lights up once you have typed something"),
    // so it must not be filtered out just because the element is currently disabled.
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    sendButton.disabled = true;

    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps?.some((step) => step.popover.title === 'Send')).toBe(true);
  });

  it('keeps a missing-target step for Driver.js to skip at runtime', () => {
    // Steps are no longer eagerly filtered by DOM presence at construction time.
    // Driver.js's skipMissingElement + waitForElement handle absent targets
    // at runtime when the tour actually reaches that step — so the Send step
    // must remain in the steps array even when the element is not in the DOM.
    document.getElementById('send-button')?.remove();

    const { result } = renderHook(() => useGettingStartedTour());
    result.current.startTour();

    expect(capturedConfig?.steps?.some((step) => step.popover.title === 'Send')).toBe(true);
  });
});
