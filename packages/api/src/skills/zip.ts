import path from 'path';
import type JSZip from 'jszip';
import type { ImportLimits, DecompressionBudget } from './limits';
import { isBinaryBuffer } from './binary';
import { DEFAULT_SKILL_IMPORT_LIMITS, createDecompressionBudget } from './limits';

const SKILL_MD = 'SKILL.md';

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
 * Locates SKILL.md at the archive root or one level deep inside a single
 * wrapping folder, returning that folder's path prefix (empty string when
 * SKILL.md is already at the root). Shared by the rename pass below (so its
 * collision disambiguation matches the flattened namespace files are
 * actually persisted into), `handleZip` (import.ts), and the security
 * scanner's re-rooting pass (scanner.ts), so all three agree on the same
 * wrapper folder for a given archive. Ignores a SKILL.md nested more than
 * one level deep, matching `handleZip`'s "root or one level deep" contract
 * — an archive with no qualifying SKILL.md yields `null`, not a false
 * one-level-deep upload as "missing SKILL.md", even though `handleZip` itself
 * tolerates that layout.
 */
export function findSkillMdPath(zip: JSZip): { path: string; prefix: string } | null {
  for (const entryPath of Object.keys(zip.files)) {
    const segments = entryPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const basename = segments[segments.length - 1];
    if (basename?.toUpperCase() === SKILL_MD.toUpperCase() && segments.length <= 2) {
      return { path: entryPath, prefix: segments.length === 2 ? `${segments[0]}/` : '' };
    }
  }
  return null;
}

/** A file whose path was rewritten because it contained a space. */
export type SkillFileRename = { oldPath: string; newPath: string };

/**
 * Thrown by `renameSpacedFilePaths` when the archive's selected SKILL.md
 * manifest (the entry `findSkillMdPath` returns) would rename into a path
 * that another, unrelated entry already occupies in the flattened
 * (prefix-stripped) namespace `handleZip` persists into and the security
 * scanner re-roots into. Every other rename collision is safe to
 * disambiguate with a numeric suffix (see `uniquePath`), but the manifest is
 * different: `findSkillMdPath` is called again after renaming completes to
 * determine which entry `handleZip` actually imports as "the skill", and
 * silently suffixing the manifest away would let that second lookup pick the
 * *other*, colliding entry instead — silently importing the wrong file as
 * the manifest. Overwriting the other entry instead would silently destroy
 * it. Neither is safe, so the archive is rejected outright.
 */
export class SkillManifestConflictError extends Error {
  constructor(public readonly conflictingPath: string) {
    super(
      `Archive contains a naming conflict: the SKILL.md manifest would collide with another ` +
        `file at "${conflictingPath}" after renaming`,
    );
    this.name = 'SkillManifestConflictError';
  }
}

export function isSkillManifestConflictError(error: unknown): error is SkillManifestConflictError {
  return error instanceof SkillManifestConflictError;
}

/**
 * Reads `entry`'s decompressed bytes for use by any pass sharing `budget`,
 * reusing a previous pass's buffer from `budget.cache` when present instead
 * of decompressing (and charging `budget.remaining` for) the same entry
 * again — see `DecompressionBudget`. On a cache miss, reads via
 * `readZipEntry` bounded by both the per-file and remaining cumulative
 * limits, charges the budget for the bytes actually read, and caches the
 * result under `entryPath` (a forward-slash-normalized path — callers must
 * normalize before calling) for later passes. Returns `null` when the entry
 * exceeds either bound.
 */
export async function readZipEntryCached(
  entryPath: string,
  entry: JSZip.JSZipObject,
  limits: ImportLimits,
  budget: DecompressionBudget,
): Promise<Buffer | null> {
  const cached = budget.cache.get(entryPath);
  if (cached != null) {
    return cached;
  }
  if (budget.remaining <= 0) {
    return null;
  }
  const effectiveLimit = Math.min(limits.maxSingleFileBytes, budget.remaining);
  const { buffer, bytesRead } = await readZipEntry(entry, effectiveLimit);
  budget.remaining -= bytesRead;
  if (buffer != null) {
    budget.cache.set(entryPath, buffer);
  }
  return buffer;
}

/**
 * Disambiguates `candidate` against `reserved` by appending a numeric suffix
 * before the file extension (`foo.txt` -> `foo-2.txt` -> `foo-3.txt`, ...),
 * so a rename can never silently overwrite an existing entry.
 */
function uniquePath(candidate: string, isReserved: (candidate: string) => boolean): string {
  if (!isReserved(candidate)) {
    return candidate;
  }
  const ext = path.posix.extname(candidate);
  const base = candidate.slice(0, candidate.length - ext.length);
  let counter = 2;
  let next = `${base}-${counter}${ext}`;
  while (isReserved(next)) {
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
 * suffix rather than overwriting that entry.
 *
 * Collisions are checked in the same flattened namespace `handleZip`
 * (import.ts) and the security scanner persist/scan into — when the archive
 * has a single wrapping folder around SKILL.md (see `findSkillMdPath`), that
 * folder is stripped from each path before the uniqueness check, since two
 * archive paths that don't collide before stripping (e.g. `skill/a-b.txt`
 * and root-level `a-b.txt`) still collide once that prefix is stripped at
 * import time. Without this, `renameSpacedFilePaths` could hand back a
 * "unique" rename that `handleZip` then silently overwrites anyway.
 *
 * Enforces the same per-file and cumulative decompressed-size bounds
 * `handleZip` applies elsewhere (`limits`, defaulting to
 * `DEFAULT_SKILL_IMPORT_LIMITS` for callers with no per-request override),
 * via `readZipEntryCached`, so a zip-bomb entry with a space in its name
 * can't force unbounded decompression — an entry that exceeds those bounds
 * is left unrenamed and falls through to the existing path-safety rejection.
 * Accepts an optional `budget` shared with other passes over the same
 * archive (see `rewriteRenamedFileReferences`, `handleZip`) so their
 * combined decompressed bytes stay bounded by a single `maxDecompressedBytes`
 * allowance rather than each pass getting its own — and so a later pass
 * reusing the same entry reuses this pass's decompressed buffer instead of
 * decompressing (and re-charging the budget for) it again; defaults to a
 * fresh budget for callers that only run this one pass. Returns the list of
 * renames applied, empty if none.
 *
 * Throws {@link SkillManifestConflictError} instead of renaming when the
 * archive's SKILL.md manifest itself needs renaming and its candidate path
 * collides with another entry already reserved at that flattened path — see
 * that error's docs for why silently disambiguating the manifest away is
 * unsafe.
 */
export async function renameSpacedFilePaths(
  zip: JSZip,
  limits: ImportLimits = DEFAULT_SKILL_IMPORT_LIMITS,
  budget: DecompressionBudget = createDecompressionBudget(limits),
): Promise<SkillFileRename[]> {
  const renames: SkillFileRename[] = [];
  const foundManifest = findSkillMdPath(zip);
  const manifestPath = foundManifest?.path.replace(/\\/g, '/') ?? null;
  const originalPrefix = foundManifest?.prefix ?? '';
  const renamedPrefix = originalPrefix ? originalPrefix.replace(/ /g, '-') : '';

  const flattenPath = (fullPath: string): string => {
    if (originalPrefix && fullPath.startsWith(originalPrefix)) {
      return fullPath.slice(originalPrefix.length);
    }
    if (renamedPrefix && fullPath.startsWith(renamedPrefix)) {
      return fullPath.slice(renamedPrefix.length);
    }
    return fullPath;
  };

  // A counting map, not a Set: a wrapped archive can hold two distinct entries
  // that flatten to the same path (e.g. `my skill/SKILL.md` and a pre-existing
  // `my-skill/SKILL.md`). A Set would collapse both into one reservation, so
  // excluding the entry being renamed from "its own" reservation below would
  // incorrectly clear the other entry's reservation too.
  const reservedFlattened = new Map<string, number>();
  for (const entryPath of Object.keys(zip.files)) {
    const flat = flattenPath(entryPath.replace(/\\/g, '/'));
    reservedFlattened.set(flat, (reservedFlattened.get(flat) ?? 0) + 1);
  }
  const isReserved = (candidate: string): boolean => (reservedFlattened.get(candidate) ?? 0) > 0;

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

    const buffer = await readZipEntryCached(normalized, entry, limits, budget);
    if (buffer == null) {
      continue;
    }

    // Exclude only this entry's own pre-rename slot before checking, so renaming
    // the wrapping folder segment (e.g. `my skill/` -> `my-skill/`) never
    // registers as a collision against itself — while any other entry that
    // independently flattens to the same path stays reserved.
    const selfFlat = flattenPath(normalized);
    const selfCount = reservedFlattened.get(selfFlat) ?? 0;
    if (selfCount > 1) {
      reservedFlattened.set(selfFlat, selfCount - 1);
    } else {
      reservedFlattened.delete(selfFlat);
    }
    const candidateFlat = flattenPath(candidate);
    const isManifestEntry = normalized === manifestPath;
    if (isManifestEntry && isReserved(candidateFlat)) {
      throw new SkillManifestConflictError(candidateFlat);
    }
    const uniqueFlat = isManifestEntry ? candidateFlat : uniquePath(candidateFlat, isReserved);
    const newPath =
      uniqueFlat === candidateFlat
        ? candidate
        : candidate.slice(0, candidate.length - candidateFlat.length) + uniqueFlat;
    reservedFlattened.set(uniqueFlat, (reservedFlattened.get(uniqueFlat) ?? 0) + 1);
    zip.remove(entryPath);
    zip.file(newPath, buffer);
    budget.cache.delete(normalized);
    budget.cache.set(newPath, buffer);
    renames.push({ oldPath: normalized, newPath });
  }
  return renames;
}

/**
 * Builds every strict path-suffix replacement pair for a single rename —
 * every suffix shorter than the full path, down to the bare basename. A
 * reference inside a skill's own text is often written relative to some
 * ancestor directory (most commonly the directory containing the manifest
 * itself, when the archive is wrapped in a folder) rather than the full
 * archive-relative path — e.g. a manifest at `my skill/SKILL.md` typically
 * refers to a companion file as `references/guide.md`, omitting the
 * wrapping `my skill/` segment entirely. Renaming only the wrapper segment
 * (`my skill` -> `my-skill`) would leave that reference unmatched by a
 * full-path-or-basename-only replacement, even though the wrapper rename
 * doesn't affect the reference at all — and a rename of any other
 * intermediate segment has the same problem. Since renaming never adds or
 * removes path segments, `oldPath` and `newPath` always split into the same
 * number of segments, so every same-length suffix pair (drop the first 1, 2,
 * ... segments from both) is a valid candidate reference form. Excludes the
 * full path itself (dropping 0 segments): unlike these shorter suffixes, a
 * rename's full path is guaranteed unique across the archive, so the caller
 * applies it unconditionally instead of folding it into the ambiguity check
 * that these shorter, potentially colliding forms need.
 */
function buildSuffixReplacements(oldPath: string, newPath: string): { from: string; to: string }[] {
  const oldSegments = oldPath.split('/');
  const newSegments = newPath.split('/');
  const replacements: { from: string; to: string }[] = [];
  for (let i = 1; i < oldSegments.length; i++) {
    const from = oldSegments.slice(i).join('/');
    const to = newSegments.slice(i).join('/');
    if (from !== to) {
      replacements.push({ from, to });
    }
  }
  return replacements;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Characters that can appear inside a file path segment — used to keep reference
 * matches from firing inside a longer path-like token (see `buildCombinedReplacer`). */
const PATH_TOKEN_CHAR = 'A-Za-z0-9_.\\-/';

/**
 * Builds one boundary-aware regex that alternates over every replacement's
 * `from` literal, plus a lookup from a matched literal to its target — so
 * rewriting an entry's text is a single linear scan regardless of how many
 * replacements exist, instead of testing and replacing each candidate against
 * the same text in turn (which costs O(replacements × text length) per entry).
 * A match still fires only when the literal isn't embedded in a longer
 * path-like token — neither immediately preceded nor followed by a character
 * that could itself be part of a file path segment (letters, digits, `_`,
 * `.`, `-`, `/`) — otherwise a plain substring match would also rewrite
 * occurrences inside unrelated prose, identifiers, or a longer name that
 * happens to contain the renamed one as a substring (e.g. matching
 * `foo bar.md` inside `foo bar.md.bak`). Alternatives are tried in the order
 * given, so callers must pass `replacements` already sorted longest-first
 * (see `rewriteRenamedFileReferences`) to preserve "longest reference wins"
 * when two candidates could start at the same position. Returns `null` for an
 * empty replacement list.
 */
function buildCombinedReplacer(
  replacements: { from: string; to: string }[],
): { regex: RegExp; targets: Map<string, string> } | null {
  if (replacements.length === 0) {
    return null;
  }
  const targets = new Map(replacements.map(({ from, to }) => [from, to]));
  const alternation = replacements.map(({ from }) => escapeRegExp(from)).join('|');
  return {
    regex: new RegExp(`(?<![${PATH_TOKEN_CHAR}])(?:${alternation})(?![${PATH_TOKEN_CHAR}])`, 'g'),
    targets,
  };
}

/**
 * Rewrites literal references to renamed files across every other text entry
 * in the archive, including entries that were themselves renamed (e.g.
 * SKILL.md may reference another renamed file). Matches the full path, the
 * bare basename, and every intermediate path suffix in between (see
 * `buildSuffixReplacements`), since a reference may be written relative to
 * any ancestor directory, not just the archive root. Binary entries —
 * detected via `isBinaryBuffer` — are left untouched. All replacements are
 * matched in a single combined pass per entry (see `buildCombinedReplacer`)
 * rather than testing/replacing each candidate against the same text in
 * turn, so cost stays linear in text size regardless of how many files were
 * renamed. Candidates are sorted longest-first before being combined so a
 * longer reference is rewritten before a shorter one can clobber part of it,
 * and a match only fires when it isn't embedded in a longer path-like token,
 * so a renamed file's path doesn't also rewrite occurrences inside unrelated
 * prose or a longer name that merely contains it as a substring. A rename's
 * full path is always applied — it's guaranteed unique since it's the file's
 * original archive path. Shorter suffix forms (see `buildSuffixReplacements`)
 * are only applied when they resolve to a single target: when two different
 * renames produce the same suffix (most commonly two spaced files sharing a
 * basename in different directories) with different targets, that suffix is
 * ambiguous and is dropped rather than letting whichever rename was
 * processed last win. Enforces the same per-file and cumulative
 * decompressed-size bounds `handleZip` applies elsewhere (`limits`,
 * defaulting to `DEFAULT_SKILL_IMPORT_LIMITS` for callers with no
 * per-request override), via `readZipEntryCached` — an entry that exceeds
 * those bounds is left unrewritten rather than fully decompressed. A
 * rewritten entry whose new content grows past `limits.maxSingleFileBytes`
 * (e.g. a collision-disambiguated target is longer than the reference it
 * replaced, repeated many times) is evicted from `budget.cache` instead of
 * cached oversized — the entry's data in `zip` is still updated to the
 * rewritten text, so a later bounded read (e.g. `handleZip`'s companion-file
 * loop) re-derives it from `zip` and correctly rejects it as oversized,
 * rather than a cache hit silently bypassing that check. Accepts an optional
 * `budget` shared with other passes over the same archive (see
 * `renameSpacedFilePaths`, `handleZip`) so their combined decompressed bytes
 * stay bounded by a single `maxDecompressedBytes` allowance rather than each
 * pass getting its own — and so this pass reuses a buffer the rename pass
 * (or a later pass reuses this pass's buffer) already decompressed instead
 * of re-charging the budget for the same entry; defaults to a fresh budget
 * for callers that only run this one pass. No-ops when there are no
 * renames.
 */
export async function rewriteRenamedFileReferences(
  zip: JSZip,
  renames: SkillFileRename[],
  limits: ImportLimits = DEFAULT_SKILL_IMPORT_LIMITS,
  budget: DecompressionBudget = createDecompressionBudget(limits),
): Promise<void> {
  if (renames.length === 0) {
    return;
  }

  const fullPathReplacements = new Map<string, string>(
    renames.map(({ oldPath, newPath }) => [oldPath, newPath]),
  );

  const suffixTargets = new Map<string, Set<string>>();
  for (const { oldPath, newPath } of renames) {
    for (const { from, to } of buildSuffixReplacements(oldPath, newPath)) {
      if (fullPathReplacements.has(from)) {
        continue;
      }
      const targets = suffixTargets.get(from);
      if (targets) {
        targets.add(to);
      } else {
        suffixTargets.set(from, new Set([to]));
      }
    }
  }

  const replacements = [
    ...Array.from(fullPathReplacements, ([from, to]) => ({ from, to })),
    ...Array.from(suffixTargets)
      .filter(([, targets]) => targets.size === 1)
      .map(([from, targets]) => ({ from, to: [...targets][0] })),
  ].sort((a, b) => b.from.length - a.from.length);

  const combined = buildCombinedReplacer(replacements);
  if (combined == null) {
    return;
  }

  for (const entryPath of Object.keys(zip.files)) {
    const entry = zip.file(entryPath);
    if (entry == null || entry.dir) {
      continue;
    }
    const normalized = entryPath.replace(/\\/g, '/');
    const buffer = await readZipEntryCached(normalized, entry, limits, budget);
    if (buffer == null) {
      continue;
    }
    if (isBinaryBuffer(buffer)) {
      continue;
    }
    const text = buffer.toString('utf-8');
    const rewritten = text.replace(combined.regex, (match) => combined.targets.get(match) ?? match);
    if (rewritten === text) {
      continue;
    }
    zip.file(entryPath, rewritten);
    const rewrittenBuffer = Buffer.from(rewritten, 'utf-8');
    if (rewrittenBuffer.length <= limits.maxSingleFileBytes) {
      budget.cache.set(normalized, rewrittenBuffer);
    } else {
      budget.cache.delete(normalized);
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
