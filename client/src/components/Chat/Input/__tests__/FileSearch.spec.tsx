// Deloitte Custom Change: tests

import React from 'react';
import { render, screen } from '@testing-library/react';
import FileSearch from '../FileSearch';

let mockHideFileSearchToggle = false;
let mockCanUseFileSearchPill = true;
let mockFileSearchToggleState = true;
let mockFileSearchPinned = false;

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(() => ({
    data: {
      interface: {
        customDeloitteFeatureFlags: {
          hideFileSearchToggle: mockHideFileSearchToggle,
        },
      },
    },
  })),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => ({
  useBadgeRowContext: () => ({
    canUseFileSearchPill: mockCanUseFileSearchPill,
    fileSearch: {
      toggleState: mockFileSearchToggleState,
      isPinned: mockFileSearchPinned,
      debouncedChange: jest.fn(),
    },
  }),
}));

jest.mock('@librechat/client', () => ({
  CheckboxButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
  VectorIcon: () => <span />,
}));

describe('FileSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHideFileSearchToggle = false;
    mockCanUseFileSearchPill = true;
    mockFileSearchToggleState = true;
    mockFileSearchPinned = false;
  });

  it('hides the file search pill when hideFileSearchToggle is true', () => {
    mockHideFileSearchToggle = true;
    render(<FileSearch />);
    expect(screen.queryByRole('button', { name: 'com_assistants_file_search' })).toBeNull();
  });

  it('renders the file search pill when visible and authorized', () => {
    render(<FileSearch />);
    expect(screen.getByRole('button', { name: 'com_assistants_file_search' })).toBeInTheDocument();
  });

  it('hides the file search pill when permission/capability checks fail', () => {
    mockCanUseFileSearchPill = false;
    render(<FileSearch />);
    expect(screen.queryByRole('button', { name: 'com_assistants_file_search' })).toBeNull();
  });
});
