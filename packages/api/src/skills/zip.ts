import path from 'path';
import type JSZip from 'jszip';

/**
 * Deloitte Custom Change: Configurable strip patterns for unwanted filesystem
 * artifacts in skill zip archives. To extend stripping behaviour, add new values
 * to the relevant constant below — no logic changes required.
 *
 * STRIP_DIR_NAMES        — directory names stripped at any depth in the archive.
 * Dot-prefixed files and directories are also stripped at any depth.
 * STRIP_BASENAME_PREFIXES — filename prefixes stripped at any depth in the archive.
 */
export const STRIP_DIR_NAMES: readonly string[] = [
  '__MACOSX', // macOS resource fork sidecar directory (Finder "Compress")
  '__pycache__', // Python compiled bytecode — not relevant to skill execution
  'node_modules', // JavaScript dependencies — should never be bundled in a skill
];
export const STRIP_BASENAME_PREFIXES: readonly string[] = [
  '._', // macOS resource fork sidecar files (e.g. ._SKILL.md)
];

/**
 * Strips unwanted filesystem artifacts from an in-memory JSZip object in-place.
 * Driven by STRIP_DIR_NAMES and STRIP_BASENAME_PREFIXES —
 * add new patterns to those constants to extend behaviour without touching this function.
 *
 * Removes any entry whose path contains a dot-prefixed segment (e.g. .DS_Store,
 * .env, .venv, .git) at any depth, any segment matching STRIP_DIR_NAMES
 * (e.g. __MACOSX, __pycache__, node_modules) at any depth, and any basename
 * matching STRIP_BASENAME_PREFIXES (e.g. ._SKILL.md).
 */
export function stripZipArtifacts(zip: JSZip): void {
  for (const entryPath of Object.keys(zip.files)) {
    const normalized = entryPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    const basename = path.posix.basename(normalized);
    if (
      segments.some((segment) => segment.startsWith('.')) ||
      segments.some((segment) => STRIP_DIR_NAMES.includes(segment)) ||
      STRIP_BASENAME_PREFIXES.some((prefix) => basename.startsWith(prefix))
    ) {
      zip.remove(entryPath);
    }
  }
}

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
