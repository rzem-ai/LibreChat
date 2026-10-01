import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SearchBar from '../SearchBar';

const mockNavigate = jest.fn();
const mockRemoveQueries = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockSetSearchState = jest.fn();

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/c/new' }),
  useNavigate: () => mockNavigate,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    removeQueries: mockRemoveQueries,
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('recoil', () => ({
  useRecoilState: () => [
    { query: '', debouncedQuery: '', isTyping: false, isSearching: false },
    mockSetSearchState,
  ],
}));

jest.mock('~/hooks/useKeyboardShortcuts', () => ({
  useShortcutAriaKey: () => 'Ctrl+K',
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNewConvo: () => ({ newConversation: jest.fn() }),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { search: 'search' },
}));

describe('SearchBar', () => {
  it('renders the search input with the stable nav-search-input id', () => {
    render(<SearchBar />);

    expect(screen.getByRole('textbox', { name: 'com_nav_search_placeholder' })).toHaveAttribute(
      'id',
      'nav-search-input',
    );
  });
});
