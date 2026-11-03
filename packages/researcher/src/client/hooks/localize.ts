import { useTranslation } from 'react-i18next';
import { useLocalize as useHostLocalize } from '@librechat/client';
import type { i18n as I18n } from 'i18next';
import { researchStrings } from '../strings';

const NAMESPACE = 'translation';
const registered = new WeakSet<I18n>();

/**
 * Merges the research copy into the host's English bundle once per i18next instance, without
 * overwriting host keys. Other languages fall back to English until they carry these keys.
 */
export function registerResearchStrings(i18n: I18n | undefined): void {
  if (typeof i18n?.addResourceBundle !== 'function' || registered.has(i18n)) {
    return;
  }
  i18n.addResourceBundle('en', NAMESPACE, researchStrings, true, false);
  registered.add(i18n);
}

/** The host's `useLocalize`, with the research copy registered first. */
export function useLocalize(): ReturnType<typeof useHostLocalize> {
  const { i18n } = useTranslation();
  registerResearchStrings(i18n);
  return useHostLocalize();
}
