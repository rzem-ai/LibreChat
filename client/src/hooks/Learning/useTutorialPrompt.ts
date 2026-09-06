import { useCallback } from 'react';
import { useTutorialStateQuery, useUpdateTutorialStateMutation } from '~/data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

/**
 * Gates the "Would you like a tutorial?" first-run prompt on the admin-configured
 * `interface.isTutorialEnabled` flag and the current user's durable, server-persisted
 * `tutorialPromptSeen` state (not localStorage, so it survives across devices/sessions).
 */
export default function useTutorialPrompt() {
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const isTutorialEnabled = startupConfig?.interface?.isTutorialEnabled !== false;

  const { data: tutorialState } = useTutorialStateQuery({
    enabled: isAuthenticated && isTutorialEnabled,
  });
  const updateTutorialState = useUpdateTutorialStateMutation();

  const shouldShowPrompt = isTutorialEnabled && tutorialState?.tutorialPromptSeen === false;

  const markPromptSeen = useCallback(() => {
    updateTutorialState.mutate({ tutorialPromptSeen: true });
  }, [updateTutorialState]);

  return { shouldShowPrompt, markPromptSeen };
}
