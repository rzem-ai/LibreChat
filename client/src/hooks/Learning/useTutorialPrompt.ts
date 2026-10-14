import { useCallback } from 'react';
import {
  useGetStartupConfig,
  useTutorialStateQuery,
  useUpdateTutorialStateMutation,
} from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

/**
 * Gates the "Would you like a tutorial?" first-run prompt on the admin-configured
 * `interface.customDeloitteFeatureFlags.isTutorialEnabled` and the current user's durable, server-persisted
 * `tutorialPromptSeen` state (not localStorage, so it survives across devices/sessions).
 */
export default function useTutorialPrompt() {
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const tutorialFlags = startupConfig?.interface?.customDeloitteFeatureFlags;
  const hasStartupConfig = startupConfig != null;
  const isTutorialEnabled =
    (tutorialFlags?.isTutorialEnabled ?? startupConfig?.interface?.isTutorialEnabled) !== false;

  const { data: tutorialState } = useTutorialStateQuery({
    enabled: isAuthenticated && hasStartupConfig && isTutorialEnabled,
  });
  const updateTutorialState = useUpdateTutorialStateMutation();

  const shouldShowPrompt =
    hasStartupConfig && isTutorialEnabled && tutorialState?.tutorialPromptSeen === false;

  const markPromptSeen = useCallback(() => {
    updateTutorialState.mutate({ tutorialPromptSeen: true });
  }, [updateTutorialState]);

  return { shouldShowPrompt, markPromptSeen };
}
