/**
 * Skill scanner client.
 *
 * Every path that introduces new skill content into LibreChat (create-from-form,
 * import a .md/.zip/.skill, or upload a file into an existing skill) zips that
 * content and POSTs it to an external scanning service (`SKILL_SCANNER_URL`).
 * The scanner returns two things we care about:
 *   1. `validation` — is the SKILL.md manifest well-formed (required fields, etc.)
 *   2. `scan`       — is the content safe (security findings with a severity)
 *
 * If the scanner rejects the content, we throw a {@link SkillScanError} (HTTP 422)
 * carrying a list of human-readable {@link SkillScanIssue}s so the route can relay
 * the specific reasons back to the UI.
 *
 * Fail-open: when `SKILL_SCANNER_URL` is unset the whole module no-ops, so local
 * dev / self-hosted setups without a scanner keep working unchanged.
 */
import JSZip from 'jszip';
import { logger } from '@librechat/data-schemas';

const SKILL_MD = 'SKILL.md';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MIN_SEVERITY = 'low';

// Ordered severity ladder. A finding gates the request when its rank is >= the
// configured minimum (SKILL_SCANNER_MIN_SEVERITY). e.g. min='medium' ignores
// info/low findings but blocks medium/high/critical.
const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Normalized, UI-ready problem. This is what we hand back to the client. */
type SkillScanIssue = {
  field?: string;
  code?: string;
  severity?: string;
  message: string;
};

type ScanFinding = {
  severity?: string;
  description?: string;
  rule_id?: string;
};

// The scanner is inconsistent about how it reports validation problems: in
// practice it returns plain strings (e.g. "Missing required field in
// frontmatter: name"), but some responses use a structured object. Accept both.
type ValidationProblem =
  | string
  | {
      code?: string;
      message?: string;
      path?: string;
    };

type SkillScanResult = {
  validation?: {
    passed?: boolean;
    problems?: ValidationProblem[];
    details?: {
      errors?: ValidationProblem[];
    };
  };
  scan?: {
    verdict?: string;
    is_safe?: boolean;
    max_severity?: string;
    findings?: ScanFinding[];
  };
  passed?: boolean;
  issues?: ValidationProblem[];
  error?: {
    details?: {
      errors?: ValidationProblem[];
    };
    message?: string;
  };
  message?: string;
};

function severityRank(severity: string | undefined): number {
  if (!severity) {
    return SEVERITY_RANK[DEFAULT_MIN_SEVERITY];
  }
  const rank = SEVERITY_RANK[severity.toLowerCase()];
  return typeof rank === 'number' ? rank : SEVERITY_RANK[DEFAULT_MIN_SEVERITY];
}

function minSeverityRank(): number {
  const raw = process.env.SKILL_SCANNER_MIN_SEVERITY;
  const rank = raw ? SEVERITY_RANK[raw.toLowerCase()] : undefined;
  return typeof rank === 'number' ? rank : SEVERITY_RANK[DEFAULT_MIN_SEVERITY];
}

/** Security findings whose severity meets/exceeds the configured threshold. */
function blockingFindings(result: SkillScanResult | undefined): ScanFinding[] {
  const threshold = minSeverityRank();
  return (result?.scan?.findings ?? []).filter(
    (finding) => severityRank(finding.severity) >= threshold,
  );
}

/**
 * Thrown when the scanner rejects content. `statusCode` (422) is what the route
 * returns; `issues` is the list of specific reasons the UI renders.
 */
export class SkillScanError extends Error {
  readonly statusCode: number;
  readonly issues: SkillScanIssue[];

  constructor(message: string, issues: SkillScanIssue[], statusCode = 422) {
    super(message);
    this.name = 'SkillScanError';
    this.statusCode = statusCode;
    this.issues = issues;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function yamlValue(value: unknown): string {
  return JSON.stringify(asString(value));
}

function parseTimeout(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

/** Coerce a string-or-object validation problem into a normalized issue. */
function problemToIssue(problem: ValidationProblem): SkillScanIssue {
  if (typeof problem === 'string') {
    return { message: problem };
  }
  return {
    code: problem.code,
    field: problem.path,
    message: problem.message ?? 'Skill manifest is invalid',
  };
}

/**
 * Flatten a scanner response into the list of issues we surface to the user.
 * Collects manifest validation problems first, then blocking security findings,
 * with progressively looser fallbacks so the user always gets *some* reason
 * rather than a generic failure.
 */
function toIssues(result: SkillScanResult | undefined): SkillScanIssue[] {
  const issues: SkillScanIssue[] = [];

  // Manifest problems live under `validation.problems` (newer) or
  // `validation.details.errors` (older) depending on scanner version.
  const validationProblems =
    result?.validation?.problems ?? result?.validation?.details?.errors ?? [];
  for (const problem of validationProblems) {
    issues.push(problemToIssue(problem));
  }

  for (const finding of blockingFindings(result)) {
    issues.push({
      code: finding.rule_id,
      severity: finding.severity,
      message: finding.description ?? 'Skill scan found an issue',
    });
  }

  if (issues.length > 0) {
    return issues;
  }

  const fromError =
    result?.error?.details?.errors?.map((issue) => problemToIssue(issue)) ?? [];

  if (fromError.length > 0) {
    return fromError;
  }

  const fallbackMessage =
    result?.message ?? result?.error?.message ?? 'Skill scan failed due to validation issues';
  return [{ message: fallbackMessage }];
}

function buildSkillMarkdown(params: {
  name: string;
  description: string;
  body?: string;
}): string {
  // Only include fields the external registry allows in its frontmatter schema.
  // LibreChat-internal fields (e.g. always-apply) must be omitted or the
  // scanner will reject the content with an "Unexpected fields" error.
  const lines = [
    '---',
    `name: ${yamlValue(params.name)}`,
    `description: ${yamlValue(params.description)}`,
    '---',
    '',
    params.body ?? '',
  ];
  return lines.join('\n');
}

async function buildSkillArchive(skillMd: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(SKILL_MD, skillMd);
  return zip.generateAsync({ type: 'uint8array' });
}

/** Zip a single arbitrary file so it can be sent to the archive scanner. */
async function buildSingleFileArchive(
  fileName: string,
  content: Uint8Array | Buffer,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(content.length);
  bytes.set(content);
  const zip = new JSZip();
  zip.file(fileName, bytes);
  return zip.generateAsync({ type: 'uint8array' });
}

export function isSkillScanError(error: unknown): error is SkillScanError {
  return error instanceof SkillScanError;
}

export function isSkillScanEnabled(): boolean {
  return (
    typeof process.env.SKILL_SCANNER_URL === 'string' &&
    process.env.SKILL_SCANNER_URL.length > 0
  );
}

type ScanArchiveOptions = {
  /**
   * When true (default), `validation.passed === false` blocks. Set to false
   * for single-file uploads that have no SKILL.md manifest, so only security
   * findings gate the request.
   */
  requireValidation?: boolean;
};

/**
 * Core scanner call: POST a zip archive to the external scanner and throw a
 * {@link SkillScanError} when the result fails the configured gate. No-ops
 * (fail-open) when `SKILL_SCANNER_URL` is unset.
 */
async function scanArchive(
  archive: Uint8Array,
  fileName: string,
  options: ScanArchiveOptions = {},
): Promise<void> {
  const url = process.env.SKILL_SCANNER_URL;
  if (!url) {
    return;
  }

  const requireValidation = options.requireValidation ?? true;
  const token = process.env.SKILL_SCANNER_BEARER_TOKEN;
  const timeoutMs = parseTimeout(process.env.SKILL_SCANNER_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const archiveBytes = new Uint8Array(archive.length);
    archiveBytes.set(archive);

    const formData = new FormData();
    formData.append('file', new Blob([archiveBytes], { type: 'application/zip' }), fileName);

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    logger.info(`[skillScanner] Scanning "${fileName}" (${archive.length} bytes) at ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    let payload: SkillScanResult | undefined;
    try {
      payload = (await response.json()) as SkillScanResult;
    } catch {
      payload = undefined;
    }

    const validationPassed = payload?.validation?.passed ?? payload?.passed;
    const isSafe = payload?.scan?.is_safe;
    const findings = blockingFindings(payload);

    // Only treat a failed validation as a block when the scanner also reports
    // specific problems. A bare `passed=false` with no problems is a scanner
    // quirk (common with `verbose=false` mode) and should not block — genuine
    // invalidity always comes with at least one problem entry.
    const validationProblems =
      payload?.validation?.problems ?? payload?.validation?.details?.errors ?? [];
    const validationFailed =
      requireValidation && validationPassed === false && validationProblems.length > 0;

    // Block if any gate trips: HTTP error, a failed manifest validation (only
    // when we require one AND the scanner reported problems), an explicit unsafe
    // verdict, or a finding at/above the configured severity threshold.
    const failed =
      !response.ok ||
      validationFailed ||
      isSafe === false ||
      findings.length > 0;

    logger.info(
      `[skillScanner] "${fileName}" -> http=${response.status} validationPassed=${validationPassed} ` +
        `validationProblems=${validationProblems.length} isSafe=${isSafe} blockingFindings=${findings.length} verdict=${failed ? 'BLOCK' : 'PASS'}`,
    );

    if (failed) {
      logger.debug(`[skillScanner] "${fileName}" raw response: ${JSON.stringify(payload)}`);
      // Join every issue into one message so callers that only read `.message`
      // still see all reasons; `.issues` carries the structured list for the UI.
      const issues = toIssues(payload);
      const message =
        issues
          .map((issue) => issue.message)
          .filter((text): text is string => Boolean(text))
          .join('; ') || 'Skill scan failed';
      throw new SkillScanError(message, issues, 422);
    }
  } catch (error) {
    if (error instanceof SkillScanError) {
      throw error;
    }
    // Treat a timeout (AbortController) and any network failure as a hard block
    // with a 422 — we can't prove the content is safe, so we don't let it pass.
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SkillScanError('Skill scan timed out', [{ message: 'Skill scan timed out' }], 422);
    }
    throw new SkillScanError(
      'Skill scan request failed',
      [{ message: 'Could not complete skill scan request' }],
      422,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Create-from-form flow: assemble a SKILL.md from the form fields, zip it, and
 * scan it before the skill is persisted.
 */
export async function scanSkillOnCreate(params: {
  name: string;
  description: string;
  body?: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const skillMd = buildSkillMarkdown(params);
  const archive = await buildSkillArchive(skillMd);
  await scanArchive(archive, `${params.name}.skill`);
}

/**
 * Edit (PATCH) flow: assemble the effective post-update SKILL.md and scan it
 * before the change is persisted.
 */
export async function scanSkillOnUpdate(params: {
  name: string;
  description: string;
  body?: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const skillMd = buildSkillMarkdown(params);
  const archive = await buildSkillArchive(skillMd);
  await scanArchive(archive, `${params.name}.skill`);
}

/**
 * Scan an already-built skill archive (the raw zip/.skill a user uploaded on
 * the import flow). Validation gating stays on — an uploaded skill must have a
 * valid SKILL.md manifest.
 */
export async function scanSkillUpload(params: {
  archive: Uint8Array | Buffer;
  fileName: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const bytes = new Uint8Array(params.archive.length);
  bytes.set(params.archive);
  await scanArchive(bytes, params.fileName);
}

/**
 * Scan a raw SKILL.md upload by zipping its content as SKILL.md before sending
 * it to the archive scanner. Validation gating stays on.
 */
export async function scanSkillMarkdown(params: {
  content: string;
  fileName?: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const archive = await buildSkillArchive(params.content);
  await scanArchive(archive, params.fileName ?? 'SKILL.md.zip');
}

/**
 * Scan a single file being added to an existing skill. There is no SKILL.md
 * manifest here, so manifest validation is skipped and only security findings
 * gate the upload.
 */
export async function scanSkillFileUpload(params: {
  fileName: string;
  content: Uint8Array | Buffer;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const archive = await buildSingleFileArchive(params.fileName, params.content);
  await scanArchive(archive, `${params.fileName}.zip`, { requireValidation: false });
}
