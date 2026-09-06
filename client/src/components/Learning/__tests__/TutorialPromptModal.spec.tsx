import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not render its content when the gate says not to show it', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: false,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal />);
    expect(screen.queryByText('com_learning_prompt_title')).not.toBeInTheDocument();
  });

  it('renders the prompt and switches to the Learning Hub panel on accept', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: true,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal />);

    expect(screen.getByText('com_learning_prompt_title')).toBeInTheDocument();

    fireEvent.click(screen.getByText('com_learning_prompt_accept'));

    expect(mockMarkPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockSetActive).toHaveBeenCalledWith('learning');
  });

  it('marks the prompt seen without switching panels on decline', () => {
    mockUseTutorialPrompt.mockReturnValue({
      shouldShowPrompt: true,
      markPromptSeen: mockMarkPromptSeen,
    });
    render(<TutorialPromptModal />);

    fireEvent.click(screen.getByText('com_learning_prompt_decline'));

    expect(mockMarkPromptSeen).toHaveBeenCalledTimes(1);
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});
