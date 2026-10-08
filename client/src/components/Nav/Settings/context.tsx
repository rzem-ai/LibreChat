import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
// Deloitte Custom Change: also import SystemRoles for the admin-only isAdmin flag below
import {
  AgentCapabilities,
  PermissionTypes,
  Permissions,
  SystemRoles,
} from 'librechat-data-provider';
import type { SettingsContextValue } from './types';
import useProviderKeys from '../SettingsTabs/ProviderKeys/useProviderKeys';
import { useHasAccess, useAuthContext, useGetAgentsConfig } from '~/hooks';
import usePersonalizationAccess from '~/hooks/usePersonalizationAccess';
import { useGetStartupConfig } from '~/data-provider';
import store from '~/store';

export function useSettingsContext(): SettingsContextValue {
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { agentsConfig } = useGetAgentsConfig();
  const { hasAnyPersonalizationFeature, hasMemoryOptOut } = usePersonalizationAccess();

  const hasRemoteAgents = useHasAccess({
    permissionType: PermissionTypes.REMOTE_AGENTS,
    permission: Permissions.USE,
  });
  const hasMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });
  const hasPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  const balanceEnabled = startupConfig?.balance?.enabled === true;
  const langfuseConnectionAccess = startupConfig?.langfuseConnectionAccess === true;
  const adminPanelURL = startupConfig?.adminPanelURL ?? '';
  const isLocalProvider = user?.provider === 'local';
  const twoFactorEnabled = user?.twoFactorEnabled === true;
  const allowAccountDeletion = startupConfig?.allowAccountDeletion !== false;
  const aboutEnabled = startupConfig?.interface?.buildInfo !== false;
  /** Deloitte Custom Change: settings visibility flags. */
  const customDeloitteFeatureFlags = startupConfig?.interface?.customDeloitteFeatureFlags;
  const accountsTabEnabled = customDeloitteFeatureFlags?.accountsTab !== false;
  const dataApiKeysEnabled = customDeloitteFeatureFlags?.dataApiKeys !== false;
  // Deloitte Custom Change: opt in to the restricted service account key-management UI.
  const adminAgentApiKeysEnabled = customDeloitteFeatureFlags?.adminAgentApiKeys === true;
  const dataDangerZoneEnabled = customDeloitteFeatureFlags?.dataDangerZone !== false;
  const hasRemoteAgentsBool = hasRemoteAgents === true;
  const hasMultiConvoBool = hasMultiConvo === true;
  const hasPromptsBool = hasPrompts === true;
  // Deloitte Custom Change: the UI mirrors the server's administrator-only lifecycle authorization.
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const engineTTS = useRecoilValue<string>(store.engineTTS);
  const hasUserProvidedEndpoints = useProviderKeys().length > 0;
  const hasStatefulCodeSessions =
    agentsConfig?.capabilities.includes(AgentCapabilities.stateful_code_sessions) ?? false;

  return useMemo(
    () => ({
      balanceEnabled,
      hasAnyPersonalizationFeature,
      hasMemoryOptOut,
      hasStatefulCodeSessions,
      hasRemoteAgents: hasRemoteAgentsBool,
      hasUserProvidedEndpoints,
      hasMultiConvo: hasMultiConvoBool,
      hasPrompts: hasPromptsBool,
      isLocalProvider,
      twoFactorEnabled,
      allowAccountDeletion,
      aboutEnabled,
      accountsTabEnabled,
      dataApiKeysEnabled,
      adminAgentApiKeysEnabled,
      isAdmin,
      dataDangerZoneEnabled,
      engineTTS,
      langfuseConnectionAccess,
      adminPanelURL,
    }),
    [
      balanceEnabled,
      hasAnyPersonalizationFeature,
      hasMemoryOptOut,
      hasStatefulCodeSessions,
      hasRemoteAgentsBool,
      hasUserProvidedEndpoints,
      hasMultiConvoBool,
      hasPromptsBool,
      isLocalProvider,
      twoFactorEnabled,
      allowAccountDeletion,
      aboutEnabled,
      accountsTabEnabled,
      dataApiKeysEnabled,
      adminAgentApiKeysEnabled,
      isAdmin,
      dataDangerZoneEnabled,
      engineTTS,
      langfuseConnectionAccess,
      adminPanelURL,
    ],
  );
}
