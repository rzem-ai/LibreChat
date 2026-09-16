/**
 * Deloitte-custom skill scan error formatting. Not part of upstream LibreChat —
 * supports the Deloitte Skill scanner (see `packages/api/src/skills/scanner.ts`).
 */
import { SKILL_SEVERITY_LEVELS } from 'librechat-data-provider';

export interface SkillScanIssue {
  code?: string;
  field?: string;
  severity?: string;
  message?: string;
  friendly?: boolean;
}

export interface SkillScanErrorData {
  error?: string;
  message?: string;
  issues?: SkillScanIssue[];
}

// Descending rank derived from the shared severity ladder (see
// SKILL_SEVERITY_LEVELS in librechat-data-provider): highest-risk first.
// Unknown severities sort last but keep their relative order.
const SEVERITY_ORDER: Record<string, number> = Object.fromEntries(
  SKILL_SEVERITY_LEVELS.map((severity, index) => [
    severity,
    SKILL_SEVERITY_LEVELS.length - 1 - index,
  ]),
);

/** Maps a severity string to its sort rank; missing/unrecognized severities rank last. */
function severityRank(severity?: string): number {
  if (!severity) {
    return Number.MAX_SAFE_INTEGER;
  }
  const rank = SEVERITY_ORDER[severity.toLowerCase()];
  return rank ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Render one scan issue as `severity=SEVERITY code=RULE_ID — description`, omitting
 * whichever parts the scanner did not supply. The severity and rule id are what make
 * a finding actionable; a bare description like "Pattern detected: exec(" is not.
 * Skipped for `friendly` issues, whose `message` is already the scanner's
 * human-friendly text and spells out severity/rule context in prose.
 * Kept to a single line since this renders inside a toast.
 */
function formatIssue(issue: SkillScanIssue): string | null {
  const { message, severity, code, friendly } = issue;
  if (!message) {
    return null;
  }
  if (friendly) {
    return message;
  }
  const parts = [
    severity ? `severity=${severity.toUpperCase()}` : null,
    code ? `code=${code}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `${parts.join(' ')} — ${message}` : message;
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
