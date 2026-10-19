import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import { render, fireEvent } from 'test/layout-test-utils';
import SpeechToTextSwitch from '../SpeechToTextSwitch';

describe('SpeechToTextSwitch', () => {
  /**
   * Mock function to set the speech-to-text state.
   */
  let mockSetSpeechToText: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetSpeechToText = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <SpeechToTextSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('SpeechToText')).toBeInTheDocument();
  });

  // Deloitte Custom Change: verify toggling on from the new default-off state.
  it('enables speech-to-text when the default-off switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <SpeechToTextSwitch onCheckedChange={mockSetSpeechToText} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('SpeechToText');
    fireEvent.click(switchElement);

    expect(mockSetSpeechToText).toHaveBeenCalledWith(true);
  });
});
