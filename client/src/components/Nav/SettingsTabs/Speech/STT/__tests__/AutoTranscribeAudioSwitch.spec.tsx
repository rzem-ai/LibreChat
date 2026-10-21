import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import AutoTranscribeAudioSwitch from '../AutoTranscribeAudioSwitch';
import { render, fireEvent } from 'test/layout-test-utils';
import store from '~/store';

describe('AutoTranscribeAudioSwitch', () => {
  /**
   * Mock function to set the auto-send-text state.
   */
  let mockSetAutoTranscribeAudio:
    | jest.Mock<void, [boolean]>
    | ((value: boolean) => void)
    | undefined;

  beforeEach(() => {
    mockSetAutoTranscribeAudio = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutoTranscribeAudioSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('AutoTranscribeAudio')).toBeInTheDocument();
  });

  // Deloitte Custom Change: enable speech-to-text before testing its dependent control.
  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot initializeState={({ set }) => set(store.speechToText, true)}>
        <AutoTranscribeAudioSwitch onCheckedChange={mockSetAutoTranscribeAudio} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('AutoTranscribeAudio');
    fireEvent.click(switchElement);

    expect(mockSetAutoTranscribeAudio).toHaveBeenCalledWith(true);
  });
});
