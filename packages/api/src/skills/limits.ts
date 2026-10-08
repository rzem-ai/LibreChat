export type ImportLimits = {
  maxZipBytes: number;
  maxDecompressedBytes: number;
  /** Caps aggregate decompression and synchronous pattern scans during filtered preflight. */
  maxContentInspectionBytes: number;
  maxEntries: number;
  maxSingleFileBytes: number;
};

export const DEFAULT_SKILL_IMPORT_LIMITS: ImportLimits = {
  maxZipBytes: 50 * 1024 * 1024,
  maxDecompressedBytes: 500 * 1024 * 1024,
  maxContentInspectionBytes: 25 * 1024 * 1024,
  maxEntries: 500,
  maxSingleFileBytes: 10 * 1024 * 1024,
};

/**
 * A cumulative decompression-byte allowance meant to be shared across every
 * pass that streams entries out of the same archive (rename, reference
 * rewrite, re-rooting, companion-file import, ...). Passing one instance to
 * each pass keeps the total decompressed bytes bounded by
 * `maxDecompressedBytes` regardless of how many passes process the archive —
 * without a shared budget, each pass would enforce the same cap
 * independently, letting a crafted archive be decompressed once per pass.
 *
 * `cache` reuses each entry's decompressed buffer across passes instead of
 * merely capping repeat reads: several passes (rename, reference rewrite, the
 * manifest read, the companion-file loop, re-rooting) legitimately need the
 * same entry's bytes, and without a cache each of those reads would still
 * charge `remaining` again for content already decompressed once — under-
 * counting real remaining capacity and spuriously rejecting archives whose
 * true unique content fits well under `maxDecompressedBytes`. Keyed by the
 * entry's *current* forward-slash-normalized path — a pass that renames an
 * entry must move its cache slot to the new path, and a pass that rewrites an
 * entry's content must overwrite its cache slot, so later readers never see a
 * stale (pre-rename or pre-rewrite) buffer.
 */
export type DecompressionBudget = { remaining: number; cache: Map<string, Buffer> };

export function createDecompressionBudget(limits: ImportLimits): DecompressionBudget {
  return { remaining: limits.maxDecompressedBytes, cache: new Map() };
}
