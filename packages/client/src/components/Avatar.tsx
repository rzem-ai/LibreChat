import React, { useState, useMemo, useCallback } from 'react';
import type { TUser } from 'librechat-data-provider';
import { Skeleton } from './Skeleton';
import { useAuthenticatedImageSrc, useAvatar } from '~/hooks';
import { UserIcon } from '~/svgs';

export interface AvatarProps {
  user?: TUser;
  size?: number;
  className?: string;
  alt?: string;
  showDefaultWhenEmpty?: boolean;
}

const Avatar: React.FC<AvatarProps> = ({
  user,
  size = 32,
  className = '',
  alt,
  showDefaultWhenEmpty = true,
}) => {
  const avatarSrc = useAvatar(user);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const avatarSeed = useMemo(
    () => user?.avatar || user?.username || user?.email || '',
    [user?.avatar, user?.username, user?.email],
  );

  const altText = useMemo(
    () => alt || `${user?.name || user?.username || user?.email || ''}'s avatar`,
    [alt, user?.name, user?.username, user?.email],
  );

  const imageSrc = useMemo(() => {
    if (!avatarSeed || imageError) return '';
    return (user?.avatar ?? '') || avatarSrc || '';
  }, [user?.avatar, avatarSrc, avatarSeed, imageError]);
  const { src: authenticatedImageSrc, isLoading: isImageLoading, isError: imageFetchError } =
    useAuthenticatedImageSrc(imageSrc);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoaded(false);
  }, []);

  const DefaultAvatar = useCallback(
    () => (
      <div
        style={{
          backgroundColor: 'rgb(121, 137, 255)',
          width: `${size}px`,
          height: `${size}px`,
          boxShadow: 'rgba(240, 246, 252, 0.1) 0px 0px 0px 1px',
        }}
        className={`relative flex items-center justify-center rounded-full p-1 text-text-primary ${className}`}
        aria-hidden="true"
      >
        <UserIcon />
      </div>
    ),
    [size, className],
  );

  if (avatarSeed.length === 0 && showDefaultWhenEmpty) {
    return <DefaultAvatar />;
  }

  if (avatarSeed.length > 0 && !imageError && !imageFetchError) {
    return (
      <div className="relative" style={{ width: `${size}px`, height: `${size}px` }}>
        {!imageLoaded && (
          <Skeleton className="rounded-full" style={{ width: `${size}px`, height: `${size}px` }} />
        )}

        {!isImageLoading && (
          <img
            style={{
              width: `${size}px`,
              height: `${size}px`,
              display: imageLoaded ? 'block' : 'none',
            }}
            className={`rounded-full ${className}`}
            src={authenticatedImageSrc}
            alt={altText}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}
      </div>
    );
  }

  if ((imageError || imageFetchError) && showDefaultWhenEmpty) {
    return <DefaultAvatar />;
  }

  return null;
};

export default Avatar;
