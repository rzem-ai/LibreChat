import type JSZip from 'jszip';

/**
 * Streams a zip entry's decompressed bytes, aborting as soon as the running
 * total exceeds `effectiveLimit` instead of buffering the full decompressed
 * content first. Protects against zip-bomb entries (a small compressed
 * payload that expands to an unbounded size) regardless of the archive's
 * declared/compressed size.
 */
export async function readZipEntry(
  zipEntry: JSZip.JSZipObject,
  effectiveLimit: number,
): Promise<{ buffer: Buffer | null; bytesRead: number }> {
  if (effectiveLimit <= 0) {
    return { buffer: null, bytesRead: 0 };
  }

  const chunks: Buffer[] = [];
  let bytesRead = 0;
  let exceededLimit = false;
  const entryStream = zipEntry.nodeStream('nodebuffer');
  await new Promise<void>((resolve, reject) => {
    entryStream.on('data', (chunk: Buffer) => {
      if (exceededLimit) {
        return;
      }
      bytesRead += chunk.length;
      if (bytesRead > effectiveLimit) {
        exceededLimit = true;
        if ('destroy' in entryStream && typeof entryStream.destroy === 'function') {
          entryStream.destroy();
        }
        resolve();
        return;
      }
      chunks.push(chunk);
    });
    entryStream.on('end', resolve);
    entryStream.on('error', reject);
  });

  return {
    buffer: exceededLimit ? null : Buffer.concat(chunks),
    bytesRead,
  };
}
