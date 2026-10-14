import { Outlet } from 'react-router-dom';
import type { JSX } from 'react/jsx-runtime';

export default function Layout(): JSX.Element {
  return (
    <main className="flex-1 overflow-y-auto px-10 pb-10 pt-14">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Outlet />
      </div>
    </main>
  );
}
