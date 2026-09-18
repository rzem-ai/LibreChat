import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import ToolsDropdown from '../ToolsDropdown';

const mockSetIsPinned = jest.fn();
const mockNativeWebSearchChange = jest.fn();

let mockBadgeRowContext = {
  agentsConfig: { capabilities: {} },
  webSearch: {
    toggleState: false,
    debouncedChange: jest.fn(),
    isPinned: false,
    setIsPinned: jest.fn(),
    authData: undefined,
  },
  nativeWebSearch: {
    toggleState: false,
    debouncedChange: mockNativeWebSearchChange,
    isPinned: false,
    setIsPinned: mockSetIsPinned,
    isSupported: true,
  },
  codeInterpreter: {
    toggleState: false,
    debouncedChange: jest.fn(),
    isPinned: false,
    setIsPinned: jest.fn(),
  },
  fileSearch: {
    toggleState: false,
    debouncedChange: jest.fn(),
    isPinned: false,
    setIsPinned: jest.fn(),
  },
  artifacts: {
    toggleState: '',
    debouncedChange: jest.fn(),
    isPinned: false,
    setIsPinned: jest.fn(),
  },
  skills: {
    toggleState: false,
    debouncedChange: jest.fn(),
    isPinned: false,
    setIsPinned: jest.fn(),
  },
  memory: {
    toggleState: false,
    debouncedChange: jest.fn(),
    isPinned: false,
    setIsPinned: jest.fn(),
  },
  mcpServerManager: {
    availableMCPServers: [],
  },
  searchApiKeyForm: {},
};

jest.mock('~/Providers', () => ({
  useBadgeRowContext: () => mockBadgeRowContext,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: () => true,
  useAuthContext: () => ({ user: { personalization: {} } }),
  useHasMemoryAccess: () => true,
  useAgentCapabilities: () => ({
    codeEnabled: false,
    memoryEnabled: false,
    webSearchEnabled: false,
    artifactsEnabled: false,
    fileSearchEnabled: false,
    skillsEnabled: false,
  }),
}));

jest.mock('~/hooks/Artifacts/useArtifactsShadcnOnly', () => ({
  __esModule: true,
  default: () => false,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: undefined }),
}));

jest.mock('@ariakit/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    MenuButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      R.createElement('button', props, children),
  };
});

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
    DropdownPopup: ({
      trigger,
      items,
    }: {
      trigger: React.ReactNode;
      items: Array<{
        onClick?: () => void;
        render: (props: Record<string, unknown>) => React.ReactNode;
      }>;
    }) =>
      R.createElement(
        'div',
        null,
        trigger,
        items.map((item, index) =>
          R.createElement(
            'div',
            { key: index },
            item.render({ role: 'menuitem', onClick: item.onClick }),
          ),
        ),
      ),
    PinIcon: ({ unpin }: { unpin?: boolean }) =>
      R.createElement('span', { 'data-testid': unpin ? 'unpin-icon' : 'pin-icon' }),
    VectorIcon: ({ className }: { className?: string }) => R.createElement('span', { className }),
  };
});

describe('ToolsDropdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBadgeRowContext = {
      ...mockBadgeRowContext,
      nativeWebSearch: {
        ...mockBadgeRowContext.nativeWebSearch,
        toggleState: false,
        isPinned: false,
        isSupported: true,
      },
    };
  });

  it('renders the native web search item when supported', () => {
    render(<ToolsDropdown />);

    expect(screen.getByTestId('tools-menu-native-web-search')).toBeInTheDocument();
    expect(screen.getByText('com_ui_native_web_search')).toBeInTheDocument();
  });

  it('pins native web search from the dropdown', async () => {
    const user = userEvent.setup();
    render(<ToolsDropdown />);

    const item = screen.getByTestId('tools-menu-native-web-search');
    await user.click(within(item).getByRole('button', { name: 'com_ui_pin' }));

    expect(mockSetIsPinned).toHaveBeenCalledWith(true);
  });

  it('toggles native web search from the dropdown row', async () => {
    const user = userEvent.setup();
    render(<ToolsDropdown />);

    await user.click(screen.getByTestId('tools-menu-native-web-search'));

    expect(mockNativeWebSearchChange).toHaveBeenCalledWith({ value: true });
  });

  it('hides the native web search item when unsupported', () => {
    mockBadgeRowContext = {
      ...mockBadgeRowContext,
      nativeWebSearch: {
        ...mockBadgeRowContext.nativeWebSearch,
        isSupported: false,
      },
    };

    render(<ToolsDropdown />);

    expect(screen.queryByTestId('tools-menu-native-web-search')).not.toBeInTheDocument();
  });
});
