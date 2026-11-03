import type { PanelChrome } from '../../../src/client/panels/chrome';

/** A bare stand-in for the app's panel frame: the heading the region is labelled by, then content. */
export const chrome: PanelChrome = {
  Header: ({ title, titleId, children }) => (
    <div>
      <h2 id={titleId}>{title}</h2>
      {children}
    </div>
  ),
  Content: ({ isLoading, skeleton, children }) => (
    <div aria-busy={isLoading}>{isLoading ? skeleton : children}</div>
  ),
};
