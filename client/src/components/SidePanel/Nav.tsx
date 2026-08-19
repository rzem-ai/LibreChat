import type { NavLink } from '~/common';
import { useActivePanel, resolveActivePanel } from '~/Providers';
import PanelHeader from './PanelHeader';
import { useLocalize } from '~/hooks';

export default function Nav({ links }: { links: NavLink[] }) {
  const localize = useLocalize();
  const { active } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  const activeLink = links.find((link) => link.id === effectiveActive);
  const ActiveComponent = activeLink?.Component;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden text-text-primary">
      {activeLink && ActiveComponent && (
        <>
          <PanelHeader title={localize(activeLink.title)} />
          <ActiveComponent />
        </>
      )}
    </div>
  );
}
