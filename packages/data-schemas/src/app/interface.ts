import { envVarRegex, extractEnvVariable, removeNullishValues } from 'librechat-data-provider';
import type { TCustomConfig, TConfigDefaults } from 'librechat-data-provider';
import type { AppConfig } from '~/types/app';
import { isMemoryEnabled } from './memory';

/**
 * Loads the default interface object.
 * @param params - The loaded custom configuration.
 * @param params.config - The loaded custom configuration.
 * @param params.configDefaults - The custom configuration default values.
 * @returns default interface object.
 */
/** Resolves a `${VAR}` value, or `undefined` when it is empty or the var is unset. */
function resolveEnvValue(value?: string): string | undefined {
  const resolved = value && extractEnvVariable(value);
  return resolved && !envVarRegex.test(resolved) ? resolved : undefined;
}

export async function loadDefaultInterface({
  config,
  configDefaults,
}: {
  config?: Partial<TCustomConfig>;
  configDefaults: TConfigDefaults;
}): Promise<AppConfig['interfaceConfig']> {
  const { interface: interfaceConfig } = config ?? {};
  const { interface: defaults } = configDefaults;
  const hasModelSpecs = (config?.modelSpecs?.list?.length ?? 0) > 0;
  const includesAddedEndpoints = (config?.modelSpecs?.addedEndpoints?.length ?? 0) > 0;

  // Deloitte Custom Change: Parse header enablement and title (extract from ENV var)
  let deloitteHeader = interfaceConfig?.deloitteHeader;
  if (interfaceConfig?.deloitteHeader) {
    let { title } = interfaceConfig.deloitteHeader;
    if (typeof title === 'string') {
      const vars = title.match(/\${([^}]+)}/g) ?? [];
      if (vars.length > 0 && vars.every((v) => v === '${APP_TITLE}')) {
        title = extractEnvVariable(title);
      }
    }
    deloitteHeader = { ...interfaceConfig.deloitteHeader, title };
  }

  // Deloitte Custom Change: the FAQ agent id differs per environment, so librechat.yaml supplies
  // it as `${LEARNING_CENTER_FAQ_AGENT_ID}`; an unset var is dropped, not sent as a placeholder.
  const learningCenter = interfaceConfig?.learningCenter && {
    ...interfaceConfig.learningCenter,
    faqAgentId: resolveEnvValue(interfaceConfig.learningCenter.faqAgentId),
  };

  const memoryConfig = config?.memory;
  const memoryEnabled = isMemoryEnabled(memoryConfig);
  /** Only disable memories if memory config is present and explicitly disabled */
  const shouldDisableMemories = memoryConfig && !memoryEnabled;
  const isTutorialEnabled =
    interfaceConfig?.customDeloitteFeatureFlags?.isTutorialEnabled ??
    interfaceConfig?.isTutorialEnabled ??
    defaults.customDeloitteFeatureFlags?.isTutorialEnabled ??
    defaults.isTutorialEnabled;
  const shouldMaterializeNestedTutorialFlag =
    interfaceConfig?.customDeloitteFeatureFlags?.isTutorialEnabled !== undefined ||
    interfaceConfig?.isTutorialEnabled !== undefined;
  const customDeloitteFeatureFlags = removeNullishValues({
    ...(defaults.customDeloitteFeatureFlags ?? {}),
    ...(interfaceConfig?.customDeloitteFeatureFlags ?? {}),
    ...(shouldMaterializeNestedTutorialFlag ? { isTutorialEnabled } : {}),
  });

  const loadedInterface: AppConfig['interfaceConfig'] = removeNullishValues({
    // UI elements - use schema defaults
    modelSelect:
      interfaceConfig?.modelSelect ??
      (hasModelSpecs ? includesAddedEndpoints : defaults.modelSelect),
    codeHighlightThrottleMs:
      interfaceConfig?.codeHighlightThrottleMs ?? defaults.codeHighlightThrottleMs,
    agentSelectorLimit: interfaceConfig?.agentSelectorLimit ?? defaults.agentSelectorLimit,
    parameters: interfaceConfig?.parameters ?? (hasModelSpecs ? false : defaults.parameters),
    presets: interfaceConfig?.presets ?? (hasModelSpecs ? false : defaults.presets),
    customDeloitteFeatureFlags,
    privacyPolicy: interfaceConfig?.privacyPolicy ?? defaults.privacyPolicy,
    termsOfService: interfaceConfig?.termsOfService ?? defaults.termsOfService,
    mcpServers: interfaceConfig?.mcpServers ?? defaults.mcpServers,
    customWelcome: interfaceConfig?.customWelcome ?? defaults.customWelcome,
    autoSubmitFromUrl: interfaceConfig?.autoSubmitFromUrl ?? defaults.autoSubmitFromUrl,
    buildInfo: interfaceConfig?.buildInfo ?? defaults.buildInfo,
    contextUsage: interfaceConfig?.contextUsage ?? defaults.contextUsage,
    contextCost: interfaceConfig?.contextCost ?? defaults.contextCost,
    feedback: interfaceConfig?.feedback ?? defaults.feedback,
    currency: interfaceConfig?.currency ?? defaults.currency,
    userMessageAlignment: interfaceConfig?.userMessageAlignment ?? defaults.userMessageAlignment,
    isTutorialEnabled,

    // Permissions and related settings - only include if explicitly configured
    bookmarks: interfaceConfig?.bookmarks,
    memories: shouldDisableMemories ? false : interfaceConfig?.memories,
    prompts: interfaceConfig?.prompts,
    multiConvo: interfaceConfig?.multiConvo,
    agents: interfaceConfig?.agents,
    temporaryChat: interfaceConfig?.temporaryChat,
    temporaryChatRetention: interfaceConfig?.temporaryChatRetention,
    generalChatRetention: interfaceConfig?.generalChatRetention,
    retentionMode: interfaceConfig?.retentionMode,
    retainAgentFiles: interfaceConfig?.retainAgentFiles,
    // Deloitte Custom Change: Retention Update
    fileRetentionHours: interfaceConfig?.fileRetentionHours,
    fileRetentionWarningHours: interfaceConfig?.fileRetentionWarningHours,
    agentRetentionHours: interfaceConfig?.agentRetentionHours,
    agentRetentionWarningHours: interfaceConfig?.agentRetentionWarningHours,
    memoryRetentionHours: interfaceConfig?.memoryRetentionHours,
    agentFileRetentionHours: interfaceConfig?.agentFileRetentionHours,
    runCode: interfaceConfig?.runCode,
    webSearch: interfaceConfig?.webSearch,
    fileSearch: interfaceConfig?.fileSearch,
    // Deloitte Custom Tests: # Visible icons for file uploads- PR #219
    providerUpload: interfaceConfig?.providerUpload,
    fileCitations: interfaceConfig?.fileCitations,
    // Deloitte Custom Change: Deloitte Logo Lockup header (PR #269)
    deloitteHeader,
    traceViewer: interfaceConfig?.traceViewer,
    defaultPinnedTools: interfaceConfig?.defaultPinnedTools,
    peoplePicker: interfaceConfig?.peoplePicker,
    marketplace: interfaceConfig?.marketplace,
    learningCenter,
    remoteAgents: interfaceConfig?.remoteAgents,
    skills: interfaceConfig?.skills,
    sharedLinks: interfaceConfig?.sharedLinks,
    schedules: interfaceConfig?.schedules,
  });

  return loadedInterface;
}
