import type { ComponentType, ReactNode } from 'react';

/**
 * The side-panel frame the host app draws around a research panel: its header row and
 * scrolling content region. The app may pass its own so these panels read like every other;
 * otherwise the panels use `defaultPanelChrome`.
 */
export type PanelChrome = {
  Header: ComponentType<{ title: string; titleId?: string; children?: ReactNode }>;
  Content: ComponentType<{
    isLoading: boolean;
    skeleton: ReactNode;
    className?: string;
    children?: ReactNode;
  }>;
};

export type PanelChromeProps = { chrome?: PanelChrome };
