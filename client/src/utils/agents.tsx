import React, { useState, useEffect } from 'react';
import { Feather } from 'lucide-react';
import { Skeleton, useAuthenticatedImageSrc } from '@librechat/client';
import type t from 'librechat-data-provider';

/**
 * Azure Blob Storage host suffixes for the clouds in scope: global, US Government and China.
 */
const AZURE_BLOB_HOST_SUFFIXES = ['windows.net', 'usgovcloudapi.net', 'chinacloudapi.cn'] as const;

/**
 * Shape of an agent avatar blob inside Azure Blob Storage.
 * Mirrors the agent branch of the server-side pattern in `api/server/routes/files/avatar.js`,
 * so only avatars the authenticated route is able to serve are proxied.
 */
const AGENT_AVATAR_BLOB_PATTERN =
  /^images\/[a-f\d]{24}\/agent-[^/]+-avatar-\d+\.(png|gif|jpe?g|webp)$/i;

/**
 * Determines whether a hostname belongs to Azure Blob Storage.
 *
 * @param hostname - Hostname taken from a parsed URL
 * @returns `true` when the host is an Azure Blob Storage endpoint
 */
const isAzureBlobHost = (hostname: string): boolean =>
  hostname.includes('.blob.') &&
  AZURE_BLOB_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

/**
 * Encodes a blob path as base64url.
 *
 * The server decodes the `file` query parameter with `Buffer.from(value, 'base64url')`,
 * so the client encodes the same way. The path is encoded from its UTF-8 bytes because
 * `btoa` alone only accepts Latin-1 characters and would throw on other paths.
 *
 * @param value - Blob path to encode
 * @returns Base64url representation of the UTF-8 encoded path
 */
const encodeBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Extracts the Azure blob path of an agent avatar from a blob URL pathname.
 *
 * Blob URLs include the container name before the `images` folder, so the path is
 * anchored on that folder instead of dropping a fixed number of segments.
 *
 * @param pathname - Pathname of the blob URL
 * @returns The blob path when it is an agent avatar, otherwise `null`
 */
const getAgentAvatarBlobPath = (pathname: string): string | null => {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  const imagesIndex = segments.indexOf('images');
  if (imagesIndex === -1) {
    return null;
  }

  const blobPath = segments.slice(imagesIndex).join('/');
  return AGENT_AVATAR_BLOB_PATTERN.test(blobPath) ? blobPath : null;
};

/**
 * Resolves the stored avatar filepath of an agent.
 *
 * Handles the legacy string representation and the current object representation.
 *
 * @param agent - Agent to read the avatar from
 * @returns The stored avatar filepath, or `null` when the agent has no avatar
 */
export const getAgentAvatarFilepath = (agent: t.Agent | null | undefined): string | null => {
  const avatar = agent?.avatar;
  if (!avatar) {
    return null;
  }

  if (typeof avatar === 'string') {
    return avatar;
  }

  return avatar.filepath ?? null;
};

/**
 * Extracts the avatar URL from an agent's avatar property
 * Handles both string and object formats
 *
 * Agent avatars stored in a private Azure Blob Storage container are recorded as direct
 * blob URLs, which a browser cannot read because the container denies anonymous access.
 * Those URLs are rewritten to the authenticated avatar route, which authorizes the
 * viewer against the agent before streaming the blob. Every other avatar location,
 * including already proxied paths and locally served files, is returned unchanged.
 *
 * @param agent - Agent to read the avatar from
 * @returns The avatar URL to render, or `null` when the agent has no avatar
 */
export const getAgentAvatarUrl = (agent: t.Agent | null | undefined): string | null => {
  const avatarUrl = getAgentAvatarFilepath(agent);
  if (!avatarUrl) {
    return null;
  }

  // Deloitte Custom Change: proxy legacy private Azure agent avatars through the authenticated image route.
  try {
    const url = new URL(avatarUrl);
    if (!isAzureBlobHost(url.hostname)) {
      return avatarUrl;
    }

    const blobPath = getAgentAvatarBlobPath(url.pathname);
    if (!blobPath) {
      return avatarUrl;
    }

    return `/api/files/images/avatar?file=${encodeBase64Url(blobPath)}`;
  } catch {
    return avatarUrl;
  }
};

const LazyAgentAvatar = ({
  url,
  alt,
  imgClass,
}: {
  url: string;
  alt: string;
  imgClass: string;
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const {
    src: authenticatedImageSrc,
    isLoading: isImageLoading,
    isError: imageFetchError,
  } = useAuthenticatedImageSrc(url);

  useEffect(() => {
    setIsLoaded(false);
  }, [url]);

  return (
    <>
      {!isImageLoading && (
        <img
          src={authenticatedImageSrc}
          alt={alt}
          className={imgClass}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsLoaded(false)}
          style={{
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}
        />
      )}
      {!isLoaded && !imageFetchError && (
        <Skeleton className="absolute inset-0 rounded-full" aria-hidden="true" />
      )}
    </>
  );
};

/**
 * Renders an agent avatar with fallback to Bot icon
 * Consistent across all agent displays
 */
export const renderAgentAvatar = (
  agent: t.Agent | null | undefined,
  options: {
    size?: 'icon' | 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    showBorder?: boolean;
  } = {},
): React.ReactElement => {
  const { size = 'md', className = '', showBorder = true } = options;

  const avatarUrl = getAgentAvatarUrl(agent);

  // Size mappings for responsive design
  const sizeClasses = {
    icon: 'h-5 w-5',
    sm: 'h-12 w-12 sm:h-14 sm:w-14',
    md: 'h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24',
    lg: 'h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28',
    xl: 'h-24 w-24',
  };

  const iconSizeClasses = {
    icon: 'h-4 w-4',
    sm: 'h-6 w-6 sm:h-7 sm:w-7',
    md: 'h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10',
    lg: 'h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12',
    xl: 'h-10 w-10',
  };

  const borderClasses = showBorder ? 'border-1 border-border-medium' : '';

  if (avatarUrl) {
    return (
      <div
        className={`relative flex items-center justify-center ${sizeClasses[size]} ${className}`}
      >
        <LazyAgentAvatar
          url={avatarUrl}
          alt={`${agent?.name || 'Agent'} avatar`}
          imgClass={`${sizeClasses[size]} rounded-full object-cover shadow-lg ${borderClasses}`}
        />
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      <Feather className={`text-text-primary ${iconSizeClasses[size]}`} strokeWidth={1.5} />
    </div>
  );
};

/**
 * Gets the display name for a contact (prioritizes name over email)
 */
export const getContactDisplayName = (agent: t.Agent | null | undefined): string | null => {
  if (!agent) return null;

  const supportName = (agent as any).support_contact?.name;
  const supportEmail = (agent as any).support_contact?.email;
  const authorName = (agent as any).authorName;

  return supportName || authorName || supportEmail || null;
};

// All hardcoded category constants removed - now using database-driven categories
