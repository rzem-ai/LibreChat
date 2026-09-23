import path from 'path';
import type JSZip from 'jszip';
import type { ImportLimits } from './limits';
import { isBinaryBuffer } from './binary';
import { DEFAULT_SKILL_IMPORT_LIMITS } from './limits';

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

/** A file whose path was rewritten because it contained a space. */
export type SkillFileRename = { oldPath: string; newPath: string };

/**
 * Disambiguates `candidate` against `reserved` by appending a numeric suffix
 * before the file extension (`foo.txt` -> `foo-2.txt` -> `foo-3.txt`, ...),
 * so a rename can never silently overwrite an existing entry.
 */
function uniquePath(candidate: string, reserved: ReadonlySet<string>): string {
  if (!reserved.has(candidate)) {
    return candidate;
  }
  const ext = path.posix.extname(candidate);
  const base = candidate.slice(0, candidate.length - ext.length);
  let counter = 2;
  let next = `${base}-${counter}${ext}`;
  while (reserved.has(next)) {
    counter += 1;
    next = `${base}-${counter}${ext}`;
  }
  return next;
}

/**
 * Renames any non-directory zip entry whose path contains a space, replacing
 * spaces in every path segment (not just the basename) with a hyphen, since
 * `isSafeSkillFilePath` rejects spaces anywhere in the path — including
 * folder names. Mutates the in-memory JSZip object in-place, mirroring
 * `stripZipArtifacts`. Renamed entries that would otherwise collide with an
 * existing (or previously renamed) path are disambiguated with a numeric
 * suffix rather than overwriting that entry. Enforces the same per-file and
 * cumulative decompressed-size bounds `handleZip` applies elsewhere (`limits`,
 * defaulting to `DEFAULT_SKILL_IMPORT_LIMITS` for callers with no per-request
 * override), via `readZipEntry`, so a zip-bomb entry with a space in its name
 * can't force unbounded decompression — an entry that exceeds those bounds is
 * left unrenamed and falls through to the existing path-safety rejection.
 * Returns the list of renames applied, empty if none.
 */
export async function renameSpacedFilePaths(
  zip: JSZip,
  limits: ImportLimits = DEFAULT_SKILL_IMPORT_LIMITS,
): Promise<SkillFileRename[]> {
  const renames: SkillFileRename[] = [];
  const reservedPaths = new Set<string>(
    Object.keys(zip.files).map((entryPath) => entryPath.replace(/\\/g, '/')),
  );
  const perFileLimit = limits.maxSingleFileBytes;
  let totalDecompressed = 0;

  for (const entryPath of Object.keys(zip.files)) {
    const entry = zip.file(entryPath);
    if (entry == null || entry.dir) {
      continue;
    }
    const normalized = entryPath.replace(/\\/g, '/');
    if (!normalized.includes(' ')) {
      continue;
    }
    const candidate = normalized
      .split('/')
      .map((segment) => segment.replace(/ /g, '-'))
      .join('/');
    if (candidate === normalized) {
      continue;
    }

    const cumulativeLimit = limits.maxDecompressedBytes - totalDecompressed;
    if (cumulativeLimit <= 0) {
      continue;
    }
    const effectiveLimit = Math.min(perFileLimit, cumulativeLimit);
    const { buffer, bytesRead } = await readZipEntry(entry, effectiveLimit);
    totalDecompressed += bytesRead;
    if (buffer == null) {
      continue;
    }

    const newPath = uniquePath(candidate, reservedPaths);
    reservedPaths.add(newPath);
    zip.remove(entryPath);
    zip.file(newPath, buffer);
    renames.push({ oldPath: normalized, newPath });
  }
  return renames;
}

/**
 * Rewrites literal references to renamed files (full relative path and bare
 * basename) across every other text entry in the archive, including entries
 * that were themselves renamed (e.g. SKILL.md may reference another renamed
 * file). Binary entries — detected via `isBinaryBuffer` — are left untouched.
 * Replacements are applied longest-match-first so a full-path reference is
 * rewritten before a bare-basename fallback can clobber part of it. Enforces
 * the same per-file and cumulative decompressed-size bounds `handleZip`
 * applies elsewhere (`limits`, defaulting to `DEFAULT_SKILL_IMPORT_LIMITS` for
 * callers with no per-request override), via `readZipEntry` — an entry that
 * exceeds those bounds is left unrewritten rather than fully decompressed.
 * No-ops when there are no renames.
 */
export async function rewriteRenamedFileReferences(
  zip: JSZip,
  renames: SkillFileRename[],
  limits: ImportLimits = DEFAULT_SKILL_IMPORT_LIMITS,
): Promise<void> {
  if (renames.length === 0) {
    return;
  }

  const replacements = renames
    .flatMap(({ oldPath, newPath }) => [
      { from: oldPath, to: newPath },
      { from: path.posix.basename(oldPath), to: path.posix.basename(newPath) },
    ])
    .filter(({ from, to }) => from !== to)
    .sort((a, b) => b.from.length - a.from.length);

  const perFileLimit = limits.maxSingleFileBytes;
  let totalDecompressed = 0;

  for (const entryPath of Object.keys(zip.files)) {
    const entry = zip.file(entryPath);
    if (entry == null || entry.dir) {
      continue;
    }
    const cumulativeLimit = limits.maxDecompressedBytes - totalDecompressed;
    if (cumulativeLimit <= 0) {
      continue;
    }
    const effectiveLimit = Math.min(perFileLimit, cumulativeLimit);
    const { buffer, bytesRead } = await readZipEntry(entry, effectiveLimit);
    totalDecompressed += bytesRead;
    if (buffer == null) {
      continue;
    }
    if (isBinaryBuffer(buffer)) {
      continue;
    }
    let text = buffer.toString('utf-8');
    let changed = false;
    for (const { from, to } of replacements) {
      if (text.includes(from)) {
        text = text.split(from).join(to);
        changed = true;
      }
    }
    if (changed) {
      zip.file(entryPath, text);
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
