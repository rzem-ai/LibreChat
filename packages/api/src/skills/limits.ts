export type ImportLimits = {
  maxZipBytes: number;
  maxDecompressedBytes: number;
  maxEntries: number;
  maxSingleFileBytes: number;
};

export const DEFAULT_SKILL_IMPORT_LIMITS: ImportLimits = {
  maxZipBytes: 50 * 1024 * 1024,
  maxDecompressedBytes: 500 * 1024 * 1024,
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
 */
export type DecompressionBudget = { remaining: number };

export function createDecompressionBudget(limits: ImportLimits): DecompressionBudget {
  return { remaining: limits.maxDecompressedBytes };
}
