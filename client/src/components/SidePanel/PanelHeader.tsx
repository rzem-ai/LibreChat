/**
 * Shared title bar for the side panel's active menu item.
 */
export default function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex shrink-0 items-center px-4 pb-1 pt-3">
      <h2 className="truncate text-lg font-bold text-text-primary">{title}</h2>
    </div>
  );
}
