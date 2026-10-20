import { Outlet } from 'react-router-dom';
import { GEL, useMediaQuery } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';

export default function Layout(): JSX.Element {
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <main className="flex-1 overflow-y-auto bg-surface-secondary">
      {isSmallScreen && (
        <GEL.Header>
          <OpenSidebar className="size-9 shrink-0 bg-surface-secondary" />
        </GEL.Header>
      )}
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-10 pt-8 sm:px-10 md:pt-14">
        <Outlet />
      </div>
    </main>
  );
}
