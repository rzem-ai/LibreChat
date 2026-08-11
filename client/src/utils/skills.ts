export interface SkillScanIssue {
  code?: string;
  field?: string;
  severity?: string;
  message?: string;
}

export interface SkillScanErrorData {
  error?: string;
  message?: string;
  issues?: SkillScanIssue[];
}

/** Highest-risk first; unknown severities sort last but keep their relative order. */
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Maps a severity string to its sort rank; missing/unrecognized severities rank last. */
function severityRank(severity?: string): number {
  if (!severity) {
    return Number.MAX_SAFE_INTEGER;
  }
  const rank = SEVERITY_ORDER[severity.toLowerCase()];
  return rank ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Render one scan issue as `SEVERITY · RULE_ID — description`, omitting whichever
 * parts the scanner did not supply. The severity and rule id are what make a
 * finding actionable; a bare description like "Pattern detected: exec(" is not.
 */
function formatIssue(issue: SkillScanIssue): string | null {
  const { message, severity, code } = issue;
  if (!message) {
    return null;
  }
  const prefix = [severity?.toUpperCase(), code].filter(Boolean).join(' · ');
  return prefix ? `${prefix} — ${message}` : message;
}

function extractErrorData(error: unknown): SkillScanErrorData | undefined {
  return (error as { response?: { data?: SkillScanErrorData } })?.response?.data;
}

/**
 * Build the user-facing text for a failed skill scan. Prefers the structured
 * `issues` list (severity-sorted, one per line) and falls back to the joined
 * `message`, the top-level `error`, then the caller's localized default.
 */
export function formatSkillScanError(error: unknown, fallback: string): string {
  const errData = extractErrorData(error);
  const issues = errData?.issues ?? [];

  const lines = issues
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map(formatIssue)
    .filter((line): line is string => Boolean(line));

  if (lines.length > 0) {
    return lines.join('\n');
  }

  return errData?.message ?? errData?.error ?? fallback;
}
