import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import AccountSettings from '../AccountSettings';

const mockSetShowShortcutsDialog = jest.fn();
const mockSetShowTermsViewer = jest.fn();
const mockLogout = jest.fn();
let mockStartupConfigData: Record<string, unknown> = {};

jest.mock('recoil', () => ({
  useSetRecoilState: () => mockSetShowShortcutsDialog,
}));

jest.mock('jotai', () => ({
  atom: jest.fn(),
  useAtom: () => [false, mockSetShowTermsViewer],
}));

jest.mock('@ariakit/react/menu', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    MenuProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    MenuButton: React.forwardRef(function MockMenuButton(
      { children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>,
      ref: React.Ref<HTMLButtonElement>,
    ) {
      return (
        <button ref={ref} type="button" {...props}>
          {children}
        </button>
      );
    }),
    Menu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    MenuItem: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  };
});

jest.mock('@librechat/client', () => ({
  // eslint-disable-next-line i18next/no-literal-string
  GearIcon: () => <span>gear</span>,
  DropdownMenuSeparator: () => <hr />,
  // eslint-disable-next-line i18next/no-literal-string
  Avatar: () => <span>avatar</span>,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    get data() {
      return mockStartupConfigData;
    },
  }),
  useGetUserBalance: () => ({ data: null }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({
    user: { name: 'Sunny', email: 'sunny@example.com' },
    isAuthenticated: true,
    logout: mockLogout,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../Settings', () => () => null);

jest.mock('~/components/Nav/SettingsTabs/General/ArchivedChatsModal', () => ({
  ArchivedChatsModal: () => null,
}));

jest.mock('~/components/Chat/Input/Files/MyFilesModal', () => ({
  MyFilesModal: () => null,
}));

jest.mock('~/components/ui/TermsAndConditionsModal', () => () => null);

jest.mock('~/store', () => ({
  __esModule: true,
  default: { showShortcutsDialog: 'showShortcutsDialog' },
}));

describe('AccountSettings', () => {
  beforeEach(() => {
    mockStartupConfigData = {};
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the account trigger with the stable nav-user id', () => {
    render(<AccountSettings collapsed />);

    expect(screen.getByRole('button', { name: 'com_nav_account_settings' })).toHaveAttribute(
      'id',
      'nav-user',
    );
  });

  it('does not render the Terms and Conditions item when the modal flow is disabled', () => {
    render(<AccountSettings collapsed />);
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_account_settings' }));

    expect(screen.queryByText('com_ui_terms_and_conditions')).not.toBeInTheDocument();
  });

  it('opens the Terms and Conditions viewer from the avatar menu when enabled', () => {
    mockStartupConfigData = { interface: { termsOfService: { modalAcceptance: true } } };
    render(<AccountSettings collapsed />);
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_account_settings' }));
    fireEvent.click(screen.getByText('com_ui_terms_and_conditions'));

    expect(mockSetShowTermsViewer).toHaveBeenCalledWith(true);
  });
});
