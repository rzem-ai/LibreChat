// Deloitte Custom Change: drives the native (provider) web-search pill
import { useMemo, useEffect, useCallback } from 'react';
import {
  EModelEndpoint,
  LocalStorageKeys,
  isAgentsEndpoint,
  modelSupportsNativeWebSearch,
} from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetAgentByIdQuery } from '~/data-provider';
import useSetIndexOptions from '~/hooks/Conversations/useSetIndexOptions';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import { useChatContext } from '~/Providers/ChatContext';
import { usePinnedTool } from './usePinnedTool';

const NATIVE_WEB_SEARCH_TOOL_KEY = 'native_web_search';

/**
 * Drives the native (provider) web-search pill:
 * 1. Resolves the active model — from the agent record on the Agents endpoint, else the conversation.
 * 2. Gates on the admin `nativeWebSearch.supportedModels` allowlist the backend also enforces.
 * 3. Reads/writes `conversation.web_search` (a model param) — not `ephemeralAgent`, which only
 *    the Agents controller reads, so a toggle there would silently no-op on plain endpoints.
 * 4. Clears a stale flag left on a model that no longer supports search.
 */
export default function useNativeWebSearchToggle() {
  const { conversation } = useChatContext();
  const { setOption } = useSetIndexOptions();
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const agentsMap = useAgentsMapContext();

  const isAgents = isAgentsEndpoint(conversation?.endpoint);
  const { data: agentData } = useGetAgentByIdQuery(isAgents ? conversation?.agent_id : undefined);
  const selectedAgent =
    isAgents && conversation?.agent_id ? agentsMap?.[conversation.agent_id] : undefined;

  const effectiveProvider = isAgents
    ? (agentData?.provider ?? selectedAgent?.provider)
    : conversation?.endpoint;
  const effectiveModel = isAgents
    ? (agentData?.model ?? selectedAgent?.model)
    : conversation?.model;

  const supportedModels = effectiveProvider
    ? endpointsConfig[effectiveProvider]?.nativeWebSearch?.supportedModels
    : undefined;
  const isSupported =
    effectiveProvider !== EModelEndpoint.bedrock &&
    modelSupportsNativeWebSearch(effectiveModel, supportedModels);

  const { isPinned, setIsPinned } = usePinnedTool({
    toolKey: NATIVE_WEB_SEARCH_TOOL_KEY,
    localStorageKey: LocalStorageKeys.LAST_NATIVE_WEB_SEARCH_TOGGLE_,
  });

  const toggleState = conversation?.web_search ?? false;
  const setWebSearch = useMemo(() => setOption('web_search'), [setOption]);
  const debouncedChange = useCallback(
    ({ value }: { value: boolean | string }) => setWebSearch(Boolean(value)),
    [setWebSearch],
  );

  /** An unsupported model must never carry `web_search: true` — the server rejects such a
   *  request outright (backend gate), so a stale flag would fail the user's next message.
   *  Covers both a model switch mid-conversation and a conversation loaded with the flag
   *  already set. Safe during load: support is permissive until `endpointsConfig` resolves. */
  useEffect(() => {
    if (!isSupported && toggleState) {
      setWebSearch(false);
    }
  }, [isSupported, toggleState, setWebSearch]);

  return { toggleState, debouncedChange, isPinned, setIsPinned, isSupported };
}
