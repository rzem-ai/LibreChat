import { render, screen } from '@testing-library/react';
import SpeechNotice from '../SpeechNotice';

let mockSpeechSettings: { speechToText?: boolean; textToSpeech?: boolean } | undefined;

jest.mock('librechat-data-provider/react-query', () => ({
  useGetCustomConfigSpeechQuery: () => ({ data: mockSpeechSettings }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

// Deloitte Custom Change: verify notice visibility follows the configured speech defaults.
describe('SpeechNotice', () => {
  beforeEach(() => {
    mockSpeechSettings = undefined;
  });

  it('shows the notice when both server speech defaults are off', () => {
    mockSpeechSettings = { speechToText: false, textToSpeech: false };

    const { rerender } = render(<SpeechNotice />);

    const notice = screen.getByRole('note');
    expect(screen.getByText('com_nav_speech_notice_title')).toBeInTheDocument();
    expect(screen.getByText('com_nav_speech_notice_description')).toBeInTheDocument();
    expect(notice).toHaveClass('text-text-primary');

    mockSpeechSettings = { speechToText: false, textToSpeech: true };
    rerender(<SpeechNotice />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    mockSpeechSettings = { speechToText: true, textToSpeech: false };
    rerender(<SpeechNotice />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    mockSpeechSettings = undefined;
    rerender(<SpeechNotice />);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
