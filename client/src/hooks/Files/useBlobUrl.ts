import { useEffect, useState } from 'react';

export type BlobUrlResult = { url: string | null; isLoading: boolean; isError: boolean };

// Deloitte: generic blob lifecycle hook. Caller stabilises fetchBlob via useCallback
// so the effect re-runs only when the resource changes. Revokes the object URL on cleanup.
export function useBlobUrl(
  fetchBlob: (() => Promise<Blob>) | null,
  enabled = true,
): BlobUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!enabled || !fetchBlob) {
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setIsLoading(true);
    setIsError(false);
    fetchBlob()
      .then((blob) => {
        if (cancelled) {
          return;
        }
        created = window.URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => !cancelled && setIsError(true))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
      if (created) {
        window.URL.revokeObjectURL(created);
      }
      setUrl(null);
    };
  }, [fetchBlob, enabled]);

  return { url, isLoading, isError };
}
