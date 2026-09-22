import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import AccountSettings from '../AccountSettings';

const mockSetShowShortcutsDialog = jest.fn();
const mockLogout = jest.fn();

jest.mock('recoil', () => ({
  useSetRecoilState: () => mockSetShowShortcutsDialog,
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
  GearIcon: () => <span>gear</span>,
  DropdownMenuSeparator: () => <hr />,
  Avatar: () => <span>avatar</span>,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: {} }),
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

jest.mock('~/store', () => ({
  __esModule: true,
  default: { showShortcutsDialog: 'showShortcutsDialog' },
}));

describe('AccountSettings', () => {
  it('renders the account trigger with the stable nav-user id', () => {
    render(<AccountSettings collapsed />);

    expect(screen.getByRole('button', { name: 'com_nav_account_settings' })).toHaveAttribute(
      'id',
      'nav-user',
    );
  });
});
