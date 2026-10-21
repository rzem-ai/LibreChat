import { isValidElementType } from 'react-is';
import { SettingsTabValues } from 'librechat-data-provider';
import type { SettingsContextValue } from '../types';
import en from '~/locales/en/translation.json';
import { registry } from '../registry';
import { TABS } from '../types';

// Deloitte Custom Change: verifies administrator-only service account API key visibility.
const validTabSections = new Map(TABS.map((t) => [t.id, new Set(t.sections.map((s) => s.id))]));

const settingsContext: SettingsContextValue = {
  balanceEnabled: false,
  hasAnyPersonalizationFeature: false,
  hasMemoryOptOut: false,
  hasStatefulCodeSessions: false,
  hasRemoteAgents: false,
  hasUserProvidedEndpoints: false,
  hasMultiConvo: false,
  hasPrompts: false,
  isLocalProvider: true,
  twoFactorEnabled: false,
  allowAccountDeletion: true,
  aboutEnabled: false,
  accountsTabEnabled: true,
  dataApiKeysEnabled: true,
  adminAgentApiKeysEnabled: false,
  dataDangerZoneEnabled: true,
  isAdmin: false,
  usernameDisplaySettingEnabled: true,
  engineTTS: 'browser',
  langfuseConnectionAccess: false,
  // Deloitte Custom Change: default feature visibility states for settings tests.
  sharedLinksEnabled: false,
  temporaryChatEnabled: false,
  adminPanelURL: '',
};

describe('settings registry', () => {
  it('has unique ids', () => {
    const ids = registry.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references a valid tab and section for every entry', () => {
    for (const entry of registry) {
      const sections = validTabSections.get(entry.tab);
      expect(sections).toBeDefined();
      expect(sections!.has(entry.section)).toBe(true);
    }
  });

  it('uses label keys that exist in the English locale', () => {
    for (const entry of registry) {
      expect(en).toHaveProperty(entry.labelKey);
    }
  });

  it('has a renderable Component for every entry', () => {
    for (const entry of registry) {
      expect(isValidElementType(entry.Component)).toBe(true);
    }
  });

  // Deloitte Custom Change: verify admin-only Langfuse visibility.
  describe('Langfuse connection visibility', () => {
    const langfuseEntry = registry.find((entry) => entry.id === 'langfuseConnection');

    it('places the connection in the Langfuse tab', () => {
      expect(langfuseEntry).toMatchObject({
        tab: SettingsTabValues.LANGFUSE,
        section: 'langfuse',
      });
    });

    it('shows the connection when the user can manage it', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          langfuseConnectionAccess: true,
          isAdmin: true,
        }),
      ).toBe(true);
    });

    it('hides the connection without Langfuse config access', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          langfuseConnectionAccess: false,
          isAdmin: true,
        }),
      ).toBe(false);
    });

    it('hides the connection from non-admins', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          langfuseConnectionAccess: true,
          isAdmin: false,
        }),
      ).toBe(false);
    });

    it('shows the connection in single-tenant mode without fanout', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          isAdmin: true,
          langfuseConnectionAccess: true,
        }),
      ).toBe(true);
    });
  });

  // Deloitte Custom Change: cover deployment and permission-driven settings visibility.
  describe('conditional setting visibility', () => {
    it.each(['importConversations', 'sharedLinks'])(
      'hides %s when chat sharing is disabled',
      (id) => {
        const entry = registry.find((setting) => setting.id === id);
        expect(entry?.show?.({ ...settingsContext, sharedLinksEnabled: false })).toBe(false);
      },
    );

    it.each(['importConversations', 'sharedLinks'])(
      'shows %s when chat sharing is enabled',
      (id) => {
        const entry = registry.find((setting) => setting.id === id);
        expect(entry?.show?.({ ...settingsContext, sharedLinksEnabled: true })).toBe(true);
      },
    );

    it('shows the default temporary chat setting when temporary chat is enabled', () => {
      const entry = registry.find((setting) => setting.id === 'defaultTemporaryChat');
      expect(entry?.show?.({ ...settingsContext, temporaryChatEnabled: true })).toBe(true);
    });

    it('hides the default temporary chat setting when temporary chat is disabled', () => {
      const entry = registry.find((setting) => setting.id === 'defaultTemporaryChat');
      expect(entry?.show?.({ ...settingsContext, temporaryChatEnabled: false })).toBe(false);
    });
  });

  describe('stateful workspace default visibility', () => {
    const entry = registry.find((setting) => setting.id === 'defaultStatefulWorkspace');

    it('shows the setting when stateful code sessions are available', () => {
      expect(entry?.show?.({ ...settingsContext, hasStatefulCodeSessions: true })).toBe(true);
    });

    it('hides the setting when stateful code sessions are unavailable', () => {
      expect(entry?.show?.({ ...settingsContext, hasStatefulCodeSessions: false })).toBe(false);
    });
  });

  // Deloitte Custom Change: verifies the username-display toggle is hidden when the bubble
  // message layout (`interface.userMessageAlignment: 'right'`) never renders a name header.
  describe('username display setting visibility', () => {
    const usernameDisplayEntry = registry.find((entry) => entry.id === 'usernameDisplay');

    it('shows the setting when the username setting is enabled', () => {
      expect(
        usernameDisplayEntry?.show?.({ ...settingsContext, usernameDisplaySettingEnabled: true }),
      ).toBe(true);
    });

    it('hides the setting when the bubble layout disables it', () => {
      expect(
        usernameDisplayEntry?.show?.({
          ...settingsContext,
          usernameDisplaySettingEnabled: false,
        }),
      ).toBe(false);
    });
  });

  // Deloitte Custom Change: verifies that only enabled administrators see Agent API key management.
  describe('Agent API key visibility', () => {
    const agentApiKeysEntry = registry.find((entry) => entry.id === 'agentApiKeys');

    it('shows service-account key management only to administrators when enabled', () => {
      expect(
        agentApiKeysEntry?.show?.({
          ...settingsContext,
          adminAgentApiKeysEnabled: true,
          isAdmin: true,
        }),
      ).toBe(true);
    });

    it('hides service-account key management from non-administrators', () => {
      expect(
        agentApiKeysEntry?.show?.({
          ...settingsContext,
          adminAgentApiKeysEnabled: true,
          isAdmin: false,
        }),
      ).toBe(false);
    });
  });
});
