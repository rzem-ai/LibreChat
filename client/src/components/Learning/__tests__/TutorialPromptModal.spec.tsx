import React from 'react';
import '@testing-library/jest-dom';
import { act, render, screen, fireEvent } from '@testing-library/react';
import TutorialPromptModal from '../TutorialPromptModal';

const mockStartGettingStartedTour = jest.fn();
const mockMarkPromptSeen = jest.fn();
const mockUseTutorialPrompt = jest.fn();
const mockSetSidebarExpanded = jest.fn();
const mockUseMediaQuery = jest.fn();
let mockSidebarExpanded = false;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useMediaQuery: () => mockUseMediaQuery(),
}));

jest.mock('recoil', () => ({
  useRecoilState: () => [mockSidebarExpanded, mockSetSidebarExpanded],
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { sidebarExpanded: 'sidebarExpanded' },
}));

jest.mock('../LearningTourContext', () => ({
  useLearningTour: () => ({ startGettingStartedTour: mockStartGettingStartedTour }),
}));

jest.mock('~/hooks/Learning/useTutorialPrompt', () => ({
  __esModule: true,
  default: () => mockUseTutorialPrompt(),
}));

describe('TutorialPromptModal', () => {
  beforeEach(() => {
    // Use fake timers so the 800ms readyToShow delay can be controlled in tests.
    jest.useFakeTimers();
    mockUseMediaQuery.mockReturnValue(false);
    mockSidebarExpanded = false;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('does not render its content when the gate says not to show it', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: false,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal />);
    // Advance past the delay — even so, shouldShowPrompt=false means nothing renders.
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(screen.queryByText('com_learning_prompt_body')).not.toBeInTheDocument();
  });

  it('renders the prompt and starts the tour on accept', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: true,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal chatReady />);
    // Advance past the 800ms readyToShow delay so isVisible becomes true.
    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(screen.getByText('com_learning_prompt_body')).toBeInTheDocument();

    fireEvent.click(screen.getByText('com_learning_prompt_accept'));

    expect(mockStartGettingStartedTour).toHaveBeenCalledTimes(1);
  });

  it('marks the prompt seen without switching panels on decline', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: true,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal chatReady />);
    // Advance past the 800ms readyToShow delay so isVisible becomes true.
    act(() => {
      jest.advanceTimersByTime(800);
    });

    fireEvent.click(screen.getByText('com_learning_prompt_decline'));

    expect(mockMarkPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockStartGettingStartedTour).not.toHaveBeenCalled();
  });

  it('opens the mobile sidebar before rendering the prompt', () => {
    mockUseMediaQuery.mockReturnValue(true);
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: true,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal chatReady />);

    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(mockSetSidebarExpanded).toHaveBeenCalledWith(true);
    expect(screen.queryByText('com_learning_prompt_body')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText('com_learning_prompt_body')).toBeInTheDocument();
  });
});
