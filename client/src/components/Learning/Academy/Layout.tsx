import { Outlet } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';

export default function Layout(): JSX.Element {
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <main className="flex-1 overflow-y-auto px-10 pb-10 pt-14">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {isSmallScreen && <OpenSidebar className="w-fit" />}
        <Outlet />
      </div>
    </main>
  );
}
