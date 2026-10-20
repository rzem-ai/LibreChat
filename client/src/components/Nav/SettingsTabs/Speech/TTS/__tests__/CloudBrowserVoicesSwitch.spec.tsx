import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import CloudBrowserVoicesSwitch from '../CloudBrowserVoicesSwitch';
import { render, fireEvent } from 'test/layout-test-utils';
import store from '~/store';

describe('CloudBrowserVoicesSwitch', () => {
  /**
   * Mock function to set the cache-tts state.
   */
  let mockSetCloudBrowserVoices:
    | jest.Mock<void, [boolean]>
    | ((value: boolean) => void)
    | undefined;

  beforeEach(() => {
    mockSetCloudBrowserVoices = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <CloudBrowserVoicesSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('CloudBrowserVoices')).toBeInTheDocument();
  });

  // Deloitte Custom Change: enable text-to-speech before testing its dependent control.
  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot initializeState={({ set }) => set(store.textToSpeech, true)}>
        <CloudBrowserVoicesSwitch onCheckedChange={mockSetCloudBrowserVoices} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('CloudBrowserVoices');
    fireEvent.click(switchElement);

    expect(mockSetCloudBrowserVoices).toHaveBeenCalledWith(true);
  });
});
