import React, { memo } from 'react';
import { ProviderIcon } from '@librechat/client';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import { EntityEndpointMark, isEntityEndpoint } from '~/components/Endpoints/EntityEndpointMark';
import { URLIcon } from '~/components/Endpoints/URLIcon';
import { useProviderIcon } from '~/hooks/Endpoint';
import { getModelSpecIconURL } from '~/utils';

interface SpecIconProps {
  currentSpec: TModelSpec;
  endpointsConfig: TEndpointsConfig;
  /** Avatar of the agent this spec targets, used when the spec defines no icon of its own. */
  agentAvatarURL?: string;
  /** Deloitte Custom Change: icon size in px; the model info tooltip header needs 32px, not the default 20px row icon. */
  size?: number;
}

const SpecIcon: React.FC<SpecIconProps> = ({
  currentSpec,
  endpointsConfig,
  agentAvatarURL,
  size = 20,
}) => {
  const iconURL = getModelSpecIconURL(currentSpec, agentAvatarURL);
  const endpoint = currentSpec.preset?.endpoint;
  const { provider, imageURL } = useProviderIcon({ endpoint, endpointsConfig, iconURL });
  const { provider: fallbackProvider } = useProviderIcon({ endpoint, endpointsConfig });
  // Deloitte Custom Change: icon-md pins width/height to 18px, which fights any non-default size prop.
  const sizeClassName = size === 20 ? 'icon-md shrink-0' : 'shrink-0';

  if (imageURL) {
    return (
      <URLIcon
        iconURL={imageURL}
        altName={currentSpec.name}
        containerStyle={{ width: size, height: size }}
        className={`${sizeClassName} overflow-hidden rounded-full`}
        provider={fallbackProvider}
      />
    );
  }

  if (isEntityEndpoint(iconURL || endpoint)) {
    return (
      <EntityEndpointMark endpoint={iconURL || endpoint} className={sizeClassName} size={size} />
    );
  }

  return (
    <ProviderIcon
      provider={provider}
      model={currentSpec.preset?.model}
      size={size}
      className={sizeClassName}
    />
  );
};

export default memo(SpecIcon);
