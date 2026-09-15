import React from 'react';
import '@testing-library/jest-dom';
import { act, render, screen, fireEvent } from '@testing-library/react';
import TutorialPromptModal from '../TutorialPromptModal';

const mockSetActive = jest.fn();
const mockMarkPromptSeen = jest.fn();
const mockUseTutorialPrompt = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => ({
  useActivePanel: () => ({ active: 'conversations', setActive: mockSetActive }),
}));

jest.mock('~/hooks/Learning/useTutorialPrompt', () => ({
  __esModule: true,
  default: () => mockUseTutorialPrompt(),
}));

describe('TutorialPromptModal', () => {
  beforeEach(() => {
    // Use fake timers so the 800ms readyToShow delay can be controlled in tests.
    jest.useFakeTimers();
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

  it('renders the prompt and switches to the Learning Hub panel on accept', () => {
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

    expect(mockMarkPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockSetActive).toHaveBeenCalledWith('learning');
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
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});
