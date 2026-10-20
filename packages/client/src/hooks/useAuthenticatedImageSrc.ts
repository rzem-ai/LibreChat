import { useEffect, useState } from 'react';
import { request } from 'librechat-data-provider';

const isAvatarProxy = (url: string) => url.startsWith('/api/files/images/avatar?');

export default function useAuthenticatedImageSrc(url: string): {
  src: string;
  isLoading: boolean;
  isError: boolean;
} {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const requiresAuth = isAvatarProxy(url);

  useEffect(() => {
    if (!requiresAuth) {
      setBlobUrl(null);
      setIsError(false);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setBlobUrl(null);
    setIsError(false);

    request
      .getResponse<Blob>(url, { responseType: 'blob' })
      .then((response) => {
        createdUrl = URL.createObjectURL(response.data);
        if (cancelled) {
          URL.revokeObjectURL(createdUrl);
          return;
        }
        setBlobUrl(createdUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setIsError(true);
        }
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [url, requiresAuth]);

  return {
    src: requiresAuth ? (blobUrl ?? '') : url,
    isLoading: requiresAuth && !blobUrl && !isError,
    isError,
  };
}
