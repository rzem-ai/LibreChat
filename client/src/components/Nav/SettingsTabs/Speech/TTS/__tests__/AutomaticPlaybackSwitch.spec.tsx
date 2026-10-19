import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import AutomaticPlaybackSwitch from '../AutomaticPlaybackSwitch';
import { render, fireEvent } from 'test/layout-test-utils';
import store from '~/store';

describe('AutomaticPlaybackSwitch', () => {
  /**
   * Mock function to set the text-to-speech state.
   */
  let mockSetAutomaticPlayback: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetAutomaticPlayback = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutomaticPlaybackSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('AutomaticPlayback')).toBeInTheDocument();
  });

  // Deloitte Custom Change: enable text-to-speech before testing its dependent control.
  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot initializeState={({ set }) => set(store.textToSpeech, true)}>
        <AutomaticPlaybackSwitch onCheckedChange={mockSetAutomaticPlayback} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('AutomaticPlayback');
    fireEvent.click(switchElement);

    expect(mockSetAutomaticPlayback).toHaveBeenCalledWith(true);
  });
});
