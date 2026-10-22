import React, { useMemo } from 'react';
import { Feather } from 'lucide-react';
import { ProviderId } from 'librechat-data-provider';
import { Sparkles, AssistantIcon, ProviderIcon, useAuthenticatedImageSrc } from '@librechat/client';
import type * as t from 'librechat-data-provider';
import { getAgentAvatarUrl, cn, getEntity, getIconEndpoint } from '~/utils';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { useProviderIcon } from '~/hooks/Endpoint';
import { isImageURL } from '~/utils/icons';

/** Callers frame the mark at two thirds of the round container around it. */
const artScale = 2 / 3;

const entityAvatarClassName =
  'bg-token-surface-secondary h-full w-full rounded-full object-cover dark:bg-surface-tertiary';

function AgentAvatar({
  avatar,
  agentName,
  className,
  size,
}: {
  avatar: string;
  agentName: string;
  className: string;
  size?: number;
}) {
  // Deloitte Custom Change: fetch private Azure agent avatars through the authenticated image hook.
  const { src, isLoading, isError } = useAuthenticatedImageSrc(avatar);

  if (agentName && avatar) {
    if (isError) {
      return <Feather className={cn(agentName === '' ? 'icon-2xl' : '', className)} size={size} />;
    }

    /**
     * Deloitte Custom Change: keep the image element mounted while the authenticated
     * request is in flight so the reserved space stays stable and no broken image is shown.
     */
    return (
      <img
        src={src || undefined}
        className={entityAvatarClassName}
        alt={agentName}
        width="80"
        height="80"
        style={isLoading ? { visibility: 'hidden' } : undefined}
      />
    );
  }

  return <Feather className={cn(agentName === '' ? 'icon-2xl' : '', className)} size={size} />;
}

function AssistantAvatar({
  avatar,
  assistantName,
  className,
  context,
  size,
}: {
  avatar: string;
  assistantName: string;
  className: string;
  context?: 'message' | 'nav' | 'landing' | 'menu-item';
  size?: number;
}) {
  if (assistantName && avatar) {
    return (
      <img
        src={avatar}
        className={entityAvatarClassName}
        alt={assistantName}
        width="80"
        height="80"
      />
    );
  }

  if (assistantName) {
    return <AssistantIcon className={cn('text-text-secondary', className)} size={size} />;
  }

  return <Sparkles className={cn(context === 'landing' ? 'icon-2xl' : '', className)} />;
}

export default function ConvoIcon({
  conversation,
  endpointsConfig,
  assistantMap,
  agentsMap,
  className = '',
  containerClassName = '',
  context,
  size,
}: {
  conversation: t.TConversation | t.TPreset | null;
  endpointsConfig: t.TEndpointsConfig;
  assistantMap: t.TAssistantsMap | undefined;
  agentsMap: t.TAgentsMap | undefined;
  containerClassName?: string;
  context?: 'message' | 'nav' | 'landing' | 'menu-item';
  className?: string;
  size?: number;
}) {
  const iconURL = conversation?.iconURL ?? '';
  let endpoint = conversation?.endpoint;
  endpoint = getIconEndpoint({ endpointsConfig, iconURL, endpoint });

  const { entity, isAgent, isAssistant } = useMemo(
    () =>
      getEntity({
        endpoint,
        agentsMap,
        assistantMap,
        agent_id: conversation?.agent_id,
        assistant_id: conversation?.assistant_id,
      }),
    [endpoint, conversation?.agent_id, conversation?.assistant_id, agentsMap, assistantMap],
  );

  const name = entity?.name ?? '';
  // Deloitte Custom Change: normalize legacy direct Azure links before rendering the agent avatar.
  const avatar = isAgent
    ? (getAgentAvatarUrl(entity as t.Agent | undefined) ?? undefined)
    : ((entity as t.Assistant | undefined)?.metadata?.avatar as string);

  const { provider, imageURL } = useProviderIcon({ endpoint, endpointsConfig, iconURL });

  if (isImageURL(iconURL)) {
    return (
      <ConvoIconURL
        iconURL={iconURL}
        modelLabel={conversation?.chatGptLabel ?? conversation?.modelLabel ?? ''}
        provider={provider}
        assistantAvatar={avatar}
        assistantName={name}
        agentAvatar={avatar}
        agentName={name}
        context={context}
      />
    );
  }

  const renderArt = () => {
    if (isAgent) {
      return (
        <AgentAvatar avatar={avatar ?? ''} agentName={name} className={className} size={size} />
      );
    }

    if (isAssistant) {
      return (
        <AssistantAvatar
          avatar={avatar ?? ''}
          assistantName={name}
          className={className}
          context={context}
          size={size}
        />
      );
    }

    if (imageURL != null) {
      return <img src={imageURL} alt={`${endpoint} Icon`} className={className} />;
    }

    return (
      <ProviderIcon
        provider={provider}
        model={conversation?.model}
        size={size != null ? Math.round(size * artScale) : undefined}
        className={cn(className, context === 'landing' && provider === ProviderId.cohere && 'p-2')}
      />
    );
  };

  return <div className={containerClassName}>{endpoint !== '' && renderArt()}</div>;
}
