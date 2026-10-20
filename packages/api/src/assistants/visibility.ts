/** Deloitte Custom Change: one visibility policy for assistant listings and private Azure avatars. */
export type AssistantVisibilityConfig = {
  privateAssistants?: boolean;
  supportedIds?: string[];
  excludedIds?: string[];
};

export type AssistantVisibility = 'allowed' | 'author' | 'denied';

export const getAssistantVisibility = ({
  assistantId,
  authorId,
  userId,
  config,
}: {
  assistantId: string;
  authorId?: string;
  userId: string;
  config?: AssistantVisibilityConfig;
}): AssistantVisibility => {
  if (config?.privateAssistants) {
    return authorId === userId ? 'allowed' : 'author';
  }
  if (config?.supportedIds?.length) {
    return config.supportedIds.includes(assistantId) ? 'allowed' : 'denied';
  }
  if (config?.excludedIds?.includes(assistantId)) {
    return 'denied';
  }
  return 'allowed';
};
