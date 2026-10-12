// Deloitte Custom Change: tests

import React from 'react';
import { render, screen } from '@testing-library/react';
import NativeWebSearch from '../NativeWebSearch';

let mockIsSupported = true;
let mockIsPinned = true;
let mockToggleState = false;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => ({
  useBadgeRowContext: () => ({
    nativeWebSearch: {
      toggleState: mockToggleState,
      isPinned: mockIsPinned,
      isSupported: mockIsSupported,
      debouncedChange: jest.fn(),
    },
  }),
}));

jest.mock('@librechat/client', () => ({
  CheckboxButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

const pill = () => screen.queryByRole('button', { name: 'com_ui_native_web_search' });

describe('NativeWebSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSupported = true;
    mockIsPinned = true;
    mockToggleState = false;
  });

  it('renders the pill when pinned on a supported model', () => {
    render(<NativeWebSearch />);
    expect(pill()).toBeInTheDocument();
  });

  it('hides the pill on an unsupported model even when toggled on', () => {
    mockIsSupported = false;
    mockToggleState = true;
    render(<NativeWebSearch />);
    expect(pill()).toBeNull();
  });

  it('hides the pill when neither pinned nor toggled on', () => {
    mockIsPinned = false;
    render(<NativeWebSearch />);
    expect(pill()).toBeNull();
  });
});
