/* eslint-disable i18next/no-literal-string */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../Academy/Layout';

let mockIsSmallScreen = false;

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => mockIsSmallScreen,
  GEL: {
    Header: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  },
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  __esModule: true,
  default: () => <button>open sidebar</button>,
}));

describe('Academy layout', () => {
  const renderLayout = () =>
    render(
      <MemoryRouter initialEntries={['/learning/tours']}>
        <Routes>
          <Route path="/learning" element={<Layout />}>
            <Route path="tours" element={<p>page content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

  it('shows the open-sidebar button on small screens', () => {
    mockIsSmallScreen = true;
    renderLayout();
    expect(screen.getByRole('button', { name: 'open sidebar' })).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('hides the open-sidebar button on larger screens', () => {
    mockIsSmallScreen = false;
    renderLayout();
    expect(screen.queryByRole('button', { name: 'open sidebar' })).not.toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});
