import { atom } from 'jotai';

/**
 * Deloitte Custom Change: lets the avatar menu re-open the Terms and Conditions
 * modal read-only, independent of the acceptance-gate flow in Root.tsx. Root
 * reads this to keep the tutorial bubble from appearing above the viewer.
 * Reset in `endSessionClientState` (AuthContext.tsx) so it doesn't leak across
 * logins via Jotai's default store.
 */
export const showTermsViewerAtom = atom(false);
