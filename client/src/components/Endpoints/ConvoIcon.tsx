import React, { useMemo } from 'react';
import { Feather } from 'lucide-react';
import { ProviderId } from 'librechat-data-provider';
import { Sparkles, AssistantIcon, ProviderIcon } from '@librechat/client';
import type * as t from 'librechat-data-provider';
import { cn, getAgentAvatarUrl, getEntity, getIconEndpoint } from '~/utils';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { URLIcon } from '~/components/Endpoints/URLIcon';
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
  if (agentName && avatar) {
    // Deloitte Custom Change: use the existing authenticated URLIcon renderer for agent profile pictures.
    return (
      <URLIcon
        iconURL={avatar}
        altName={agentName}
        className={entityAvatarClassName}
        containerStyle={{ width: '100%', height: '100%' }}
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
  // Deloitte Custom Change: resolve agent avatar strings and stored filepath objects through the shared helper.
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
