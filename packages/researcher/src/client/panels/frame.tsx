import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { PanelChrome } from './chrome';
import { useLocalize } from '../hooks/localize';

/** Title row of a research side panel; stays out of the scroll. */
function PanelHeader({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId?: string;
  children?: ReactNode;
}): ReactElement {
  const fallbackId = useId();
  return (
    <div className="shrink-0 space-y-2 px-3 pb-2">
      <div className="flex h-9 items-center justify-between gap-2">
        <h2 id={titleId ?? fallbackId} className="truncate text-sm font-medium text-text-primary">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

/** Scrolling content region; draws the skeleton, with a live announcement, while loading. */
function PanelContent({
  isLoading,
  skeleton,
  className,
  children,
}: {
  isLoading: boolean;
  skeleton: ReactNode;
  className?: string;
  children?: ReactNode;
}): ReactElement {
  const localize = useLocalize();
  return (
    <div aria-busy={isLoading} className={`min-h-0 flex-1 overflow-y-auto ${className ?? ''}`}>
      {isLoading ? (
        <>
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {localize('com_ui_loading')}
          </span>
          {skeleton}
        </>
      ) : (
        children
      )}
    </div>
  );
}

/** The frame research panels use when the host passes none of its own. */
export const defaultPanelChrome: PanelChrome = { Header: PanelHeader, Content: PanelContent };
