import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Skeleton } from '@librechat/client';
import { apiBaseUrl, FileSources } from 'librechat-data-provider';
// Deloitte Custom Change: fetch private azure_blob images via authenticated blob URL
import { useAuthenticatedBlobUrl } from '~/data-provider';
import { cn, toAbsoluteFilePath } from '~/utils';
import DialogImage from './DialogImage';

/** Max display height for chat images (Tailwind JIT class) */
export const IMAGE_MAX_H = 'max-h-[45vh]' as const;
/** Matches the `max-w-lg` Tailwind class on the wrapper button (32rem = 512px at 16px base) */
const IMAGE_MAX_W_PX = 512;

/** Caches image dimensions by src so remounts can reserve space */
const dimensionCache = new Map<string, { width: number; height: number }>();
/** Tracks URLs that have been fully painted — skip skeleton on remount */
const paintedUrls = new Set<string>();

/** Test-only: resets module-level caches */
export function _resetImageCaches(): void {
  dimensionCache.clear();
  paintedUrls.clear();
}

function computeHeightStyle(w: number, h: number): React.CSSProperties {
  return { height: `min(45vh, ${(h / w) * 100}vw, ${(h / w) * IMAGE_MAX_W_PX}px)` };
}

const Image = ({
  imagePath,
  altText,
  fileName,
  className,
  alignRight = false,
  args,
  width,
  height,
  source,
  fileId,
  userId,
}: {
  imagePath: string;
  altText: string;
  /** Filename used for the download link. Falls back to altText then 'image' if absent. */
  fileName?: string;
  className?: string;
  alignRight?: boolean;
  args?: {
    prompt?: string;
    quality?: 'low' | 'medium' | 'high';
    size?: string;
    style?: string;
    [key: string]: unknown;
  };
  width?: number;
  height?: number;
  source?: string;
  fileId?: string;
  userId?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Deloitte Custom Change: rewrite raw azure_blob URLs to same-origin proxy so browser doesn't hit
  // private container directly (avoids 403 + prevents Bearer leak to blob.core.windows.net).
  const rewrittenPath = useMemo(() => {
    if (source === FileSources.azure_blob && fileId && userId && imagePath?.startsWith('http')) {
      // inline=true returns an allowlisted MIME type rather than forcing Content-Disposition: attachment.
      return `/api/files/download/${userId}/${fileId}?inline=true`;
    }
    return imagePath;
  }, [imagePath, source, fileId, userId]);

  /** Root-relative server paths (`/images/...` static, `/api/...` downloads and
   *  share routes) are resolved against the API base so they load under a
   *  subpath deployment. */
  const absoluteImageUrl = useMemo(
    () => toAbsoluteFilePath(rewrittenPath, apiBaseUrl()),
    [rewrittenPath],
  );

  // Deloitte Custom Change: /api/ routes need Bearer JWT; <img src> can't send it — fetch via axios blob.
  const needsBlob = rewrittenPath?.startsWith('/api/') ?? false;
  const { url: blobUrl } = useAuthenticatedBlobUrl(absoluteImageUrl, needsBlob);
  const displayUrl = needsBlob ? blobUrl : absoluteImageUrl;

  const downloadImage = async () => {
    // Deloitte: bail early if the authenticated blob URL hasn't resolved yet —
    // the fallback fetch() below cannot attach the Bearer header and would 401.
    // Neither branch reaches the try/catch below; both return before it.
    if (needsBlob && !blobUrl) {
      return;
    }
    const downloadName = fileName || altText || 'image';
    if (blobUrl) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    // Non-blob path (public URLs, static /images/): fetch without auth header.
    try {
      const response = await fetch(absoluteImageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      const link = document.createElement('a');
      link.href = absoluteImageUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  useEffect(() => {
    if (width && height && absoluteImageUrl) {
      dimensionCache.set(absoluteImageUrl, { width, height });
    }
  }, [absoluteImageUrl, width, height]);

  const dims = width && height ? { width, height } : dimensionCache.get(absoluteImageUrl);
  const hasDimensions = !!(dims?.width && dims?.height);
  const heightStyle = hasDimensions ? computeHeightStyle(dims.width, dims.height) : undefined;
  const showSkeleton = hasDimensions && !paintedUrls.has(absoluteImageUrl);

  return (
    <div className={alignRight ? 'ml-auto' : undefined}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`View ${altText} in dialog`}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        className={cn(
          'relative mt-1 w-full max-w-lg cursor-pointer overflow-hidden rounded-lg border border-border-light text-text-secondary-alt shadow-md transition-shadow',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary',
          className,
        )}
        style={heightStyle}
      >
        {(showSkeleton || (needsBlob && !displayUrl)) && (
          <Skeleton className="absolute inset-0" aria-hidden="true" />
        )}
        {displayUrl && (
          <img
            alt={altText}
            src={displayUrl}
            onLoad={() => paintedUrls.add(absoluteImageUrl)}
            className={cn(
              'relative block text-transparent',
              hasDimensions
                ? 'size-full object-contain'
                : cn('h-auto w-auto max-w-full', IMAGE_MAX_H),
            )}
          />
        )}
      </button>
      <DialogImage
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        src={displayUrl ?? absoluteImageUrl}
        downloadImage={downloadImage}
        args={args}
        triggerRef={triggerRef}
      />
    </div>
  );
};

export default Image;
