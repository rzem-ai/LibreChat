import { useMemo } from 'react';
import type { TInterfaceConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

type DeloitteFlags = TInterfaceConfig['customDeloitteFeatureFlags'];

/** Deloitte Custom Change: pin buttons are shown unless the dropdown is hidden or `toolsDropdown.showPinButtons` is false. */
export const getShowPinButtons = (flags?: DeloitteFlags): boolean =>
  flags?.showToolsDropdown !== false && flags?.toolsDropdown?.showPinButtons !== false;

/** Deloitte Custom Change: admin config for the chat tools dropdown (`customDeloitteFeatureFlags.toolsDropdown`). */
export function useToolsDropdownConfig() {
  const { data: startupConfig } = useGetStartupConfig();
  const flags = startupConfig?.interface?.customDeloitteFeatureFlags;
  const configuredItems = flags?.toolsDropdown?.items;

  const items = useMemo(
    () => (configuredItems ? new Set<string>(configuredItems) : null),
    [configuredItems],
  );

  return {
    showPinButtons: getShowPinButtons(flags),
    /** Every row shows when `items` is unset. */
    isItemVisible: (key: string) => items == null || items.has(key),
    /** True when the dropdown row is the tool's only control: its prompt-bar pill shows only when pinned. */
    isDropdownOnly: (key: string) =>
      flags?.showToolsDropdown !== false &&
      flags?.toolsDropdown?.showPinButtons === false &&
      (items == null || items.has(key)),
  };
}
