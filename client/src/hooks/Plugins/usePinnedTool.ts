// Deloitte Custom Change: pin logic extracted from useToolToggle so non-ephemeral controls can reuse it
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { useGetStartupConfig } from '~/data-provider';

interface UsePinnedToolOptions {
  toolKey: string;
  localStorageKey: string;
}

/**
 * Owns a badge pill's "pinned" (visible in the input row) state:
 * 1. Admin `defaultPinnedTools` seeds the initial value.
 * 2. A user's stored pin preference always wins thereafter.
 * 3. Guards the cold-load race where `startupConfig` resolves after mount.
 * 4. Deloitte: when `showToolsDropdown` is off, `defaultPinnedTools` becomes a forced value.
 *
 * Extracted from `useToolToggle` (which now consumes it) so controls that don't touch
 * `ephemeralAgent` can reuse pinning. Single source of truth — don't reintroduce a local copy.
 */
export function usePinnedTool({ toolKey, localStorageKey }: UsePinnedToolOptions) {
  const { data: startupConfig } = useGetStartupConfig();

  /** Admin-configured default: pin this tool when its key is listed in `defaultPinnedTools`.
   *  Only seeds the initial state — a user's stored pin preference always takes precedence. */
  const defaultPinned = useMemo(() => {
    const defaultPinnedTools = startupConfig?.interface?.defaultPinnedTools;
    return Array.isArray(defaultPinnedTools) && defaultPinnedTools.includes(toolKey);
  }, [startupConfig?.interface?.defaultPinnedTools, toolKey]);

  /** Captured before mount (pre-seed): did the user already have a stored pin preference?
   *  Distinguishes a real choice from `useLocalStorage`'s eager default-seed below. Legacy
   *  auto-seeded values count as a preference, so existing users keep their state. */
  const [hadStoredPin] = useState(() => localStorage.getItem(`${localStorageKey}pinned`) != null);

  const [isPinned, setIsPinnedRaw] = useLocalStorage<boolean>(
    `${localStorageKey}pinned`,
    defaultPinned,
  );

  /** Mark explicit pin toggles so a click made before `startupConfig` resolves is never
   *  clobbered by the admin-default effect below. */
  const userSetPin = useRef(false);
  const setIsPinned = useCallback(
    (value: boolean) => {
      userSetPin.current = true;
      setIsPinnedRaw(value);
    },
    [setIsPinnedRaw],
  );

  /** Cold load: `startupConfig` can resolve after mount, so `defaultPinned` starts `false`
   *  and gets eagerly persisted. Once config arrives, apply the real default for users who
   *  have neither a stored preference nor an in-session pin click — runs once.
   *  When `showToolsDropdown` is disabled the user has no way to pin tools manually, so
   *  `defaultPinnedTools` is treated as a forced value. The forced path re-runs until stable
   *  rather than marking itself done on first pass — this handles the race where
   *  useLocalStorage reads a stale "false" from storage after the initial render already
   *  computed defaultPinned = true from a cached startupConfig. */
  const appliedDefaultPin = useRef(false);
  useEffect(() => {
    // Deloitte Custom Change: check startupConfig exists
    if (startupConfig == null) {
      return;
    }
    // Deloitte Custom Change: Force pin the tool if tools dropdown is hidden
    const toolsDropdownHidden =
      startupConfig.interface?.customDeloitteFeatureFlags?.showToolsDropdown === false;
    if (toolsDropdownHidden) {
      if (isPinned !== defaultPinned) {
        setIsPinnedRaw(defaultPinned);
      }
      return;
    }
    if (appliedDefaultPin.current) {
      return;
    }
    appliedDefaultPin.current = true;
    if (hadStoredPin || userSetPin.current) {
      return;
    }
    if (defaultPinned !== isPinned) {
      setIsPinnedRaw(defaultPinned);
    }
  }, [startupConfig, hadStoredPin, defaultPinned, isPinned, setIsPinnedRaw]);

  return { isPinned, setIsPinned };
}
