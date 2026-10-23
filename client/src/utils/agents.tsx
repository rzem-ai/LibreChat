import React, { useState, useEffect } from 'react';
import { Feather } from 'lucide-react';
import { Skeleton, useAuthenticatedImageSrc } from '@librechat/client';
import type t from 'librechat-data-provider';

// Deloitte Custom Change: only normalize canonical Azure Blob Storage hostnames.
/**
 * Azure Blob Storage host suffixes for the clouds in scope: global, US Government and China.
 */
const AZURE_BLOB_HOST_SUFFIXES = [
  '.blob.core.windows.net',
  '.blob.core.usgovcloudapi.net',
  '.blob.core.chinacloudapi.cn',
] as const;

// Deloitte Custom Change: mirror the server's allowlist for agent avatar blob paths.
/**
 * Shape of an agent avatar blob inside Azure Blob Storage.
 * Mirrors the agent branch of the server-side pattern in `api/server/routes/files/avatar.js`,
 * so only avatars the authenticated route is able to serve are proxied.
 */
const AGENT_AVATAR_BLOB_PATTERN =
  /^images\/[a-f\d]{24}\/agent-[^/]+-avatar-\d+\.(png|gif|jpe?g|webp)$/i;

// Deloitte Custom Change: restrict private avatar URL rewrites to supported Azure Blob endpoints.
/**
 * Determines whether a hostname belongs to Azure Blob Storage.
 *
 * @param hostname - Hostname taken from a parsed URL
 * @returns `true` when the host is an Azure Blob Storage endpoint
 */
const isAzureBlobHost = (hostname: string): boolean => {
  const suffix = AZURE_BLOB_HOST_SUFFIXES.find(
    (candidate: (typeof AZURE_BLOB_HOST_SUFFIXES)[number]): boolean => hostname.endsWith(candidate),
  );
  if (!suffix) {
    return false;
  }

  const accountName = hostname.slice(0, -suffix.length);
  return /^[a-z\d]{3,24}$/.test(accountName);
};

// Deloitte Custom Change: encode proxy paths in the format accepted by the avatar API.
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

// Deloitte Custom Change: only derive paths the authenticated avatar route can serve.
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
    .map((segment: string): string => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] !== 'images') {
      continue;
    }

    const blobPath = segments.slice(index).join('/');
    if (AGENT_AVATAR_BLOB_PATTERN.test(blobPath)) {
      return blobPath;
    }
  }

  return null;
};

// Deloitte Custom Change: use one authenticated image renderer for all agent avatar surfaces.
/** Props controlling the shared authenticated agent-avatar image. */
export interface AgentAvatarImageProps {
  /** Avatar URL, normalized to the authenticated proxy URL when stored in private Azure. */
  url: string;
  /** Accessible description for the avatar image. */
  alt: string;
  /** Surface-specific image classes. */
  className: string;
  /** Icon or other content displayed when the authenticated request fails. */
  fallback?: React.ReactNode;
  /** Native image loading behavior. */
  loading?: 'eager' | 'lazy';
  /** Whether to show the shared skeleton until the image is loaded. */
  showSkeleton?: boolean;
  /** Keep the image element mounted but hidden while the request is pending. */
  keepSpaceWhileLoading?: boolean;
  /** Show the fallback while the authenticated request is pending. */
  showFallbackWhileLoading?: boolean;
  /** Optional intrinsic image width. */
  width?: number | string;
  /** Optional intrinsic image height. */
  height?: number | string;
}

// Deloitte Custom Change: share authenticated retrieval, loading, and fallback behavior across avatar surfaces.
/**
 * Renders an agent avatar using the authenticated image loader.
 *
 * @param props - URL, accessibility text, sizing, loading behavior, and optional fallback.
 * @param props.url - Avatar URL to load.
 * @param props.alt - Accessible description for the image.
 * @param props.className - Surface-specific image classes.
 * @param props.fallback - Optional fallback content for a failed request.
 * @param props.loading - Native image loading behavior.
 * @param props.showSkeleton - Whether to display the shared loading skeleton.
 * @param props.keepSpaceWhileLoading - Whether to reserve image space while loading.
 * @param props.showFallbackWhileLoading - Whether to show fallback content during loading.
 * @param props.width - Optional intrinsic image width.
 * @param props.height - Optional intrinsic image height.
 * @returns The authenticated avatar image, loading state, or configured fallback.
 */
export const AgentAvatarImage = ({
  url,
  alt,
  className,
  fallback,
  loading = 'eager',
  showSkeleton = false,
  keepSpaceWhileLoading = false,
  showFallbackWhileLoading = false,
  width,
  height,
}: AgentAvatarImageProps): React.ReactElement => {
  const [isLoaded, setIsLoaded] = useState(false);
  const { src, isLoading, isError } = useAuthenticatedImageSrc(url);

  useEffect((): void => {
    setIsLoaded(false);
  }, [url]);

  if (isError || (isLoading && showFallbackWhileLoading)) {
    return <>{fallback}</>;
  }

  return (
    <>
      {(!isLoading || keepSpaceWhileLoading) && (
        <img
          src={src || undefined}
          alt={alt}
          className={className}
          loading={loading}
          width={width}
          height={height}
          onLoad={(): void => setIsLoaded(true)}
          onError={(): void => setIsLoaded(false)}
          style={{
            ...(keepSpaceWhileLoading && isLoading ? { visibility: 'hidden' } : {}),
            ...(showSkeleton
              ? { opacity: isLoaded ? 1 : 0, transition: 'opacity 0.2s ease-in-out' }
              : {}),
          }}
        />
      )}
      {showSkeleton && !isLoaded && (
        <Skeleton className="absolute inset-0 rounded-full" aria-hidden="true" />
      )}
    </>
  );
};

// Deloitte Custom Change: compare avatar values consistently across legacy and current records.
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

// Deloitte Custom Change: normalize supported private Azure avatar URLs for authenticated loading.
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
  // Deloitte Custom Change: share authenticated loading and skeleton behavior across agent avatars.
  return <AgentAvatarImage url={url} alt={alt} className={imgClass} loading="lazy" showSkeleton />;
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
