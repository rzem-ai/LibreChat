/**
 * Deloitte Skill scanner client.
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
import { SKILL_SEVERITY_LEVELS } from 'librechat-data-provider';
import { parseSkillMarkdown, extractSkillBody } from './parse';
import { readZipEntry, stripZipArtifacts } from './zip';
import { DEFAULT_SKILL_IMPORT_LIMITS } from './limits';

const SKILL_MD = 'SKILL.md';
const DEFAULT_TIMEOUT_MS = 15000;

// Fallback blocking threshold when the operator hasn't set
// SKILL_SCANNER_MIN_SEVERITY (or set it to something unrecognized). Only
// affects deployments with no explicit config — this repo's dev/uat/local
// environments always set SKILL_SCANNER_MIN_SEVERITY explicitly.
const DEFAULT_MIN_SEVERITY_THRESHOLD = 'high';

// Fallback rank for a finding the scanner sends back with no `severity` field,
// or a value not in SEVERITY_RANK (e.g. a new level the scanner adds later).
// Independent of SKILL_SCANNER_MIN_SEVERITY — this is about incomplete data
// from the scanner, not the configured threshold. Fail-safe: this is a security
// gate, so data we can't classify must always block rather than silently
// ranking below the configured minimum.
const UNKNOWN_FINDING_SEVERITY = 'critical';

// Ascending rank derived from the shared severity ladder (see
// SKILL_SEVERITY_LEVELS in librechat-data-provider). A finding gates the
// request when its rank is >= the configured minimum
// (SKILL_SCANNER_MIN_SEVERITY). e.g. min='medium' ignores info/low findings
// but blocks medium/high/critical.
const SEVERITY_RANK: Record<string, number> = Object.fromEntries(
  SKILL_SEVERITY_LEVELS.map((severity, index) => [severity, index]),
);

/** Normalized, UI-ready problem. This is what we hand back to the client. */
type SkillScanIssue = {
  field?: string;
  code?: string;
  severity?: string;
  message: string;
  // True when `message` is already the scanner's human-friendly `user_message`
  // (prose that spells out severity/rule context on its own), so the client
  // shouldn't also prepend a raw `severity=`/`code=` prefix.
  friendly?: boolean;
};

type ScanFinding = {
  severity?: string;
  description?: string;
  rule_id?: string;
  // Human-friendly, pre-formatted variant of `description` (e.g. "Critical —
  // Command Injection Eval: Pattern detected: exec("). Preferred over
  // `description` when present so the UI shows the scanner's own user-facing
  // copy instead of the raw rule description.
  user_message?: string;
};

// Per the scanner's OpenAPI schema, a manifest validation problem is always a
// plain string, e.g. "Missing required field in frontmatter: name".
type ValidationProblem = string;

type SkillScanResult = {
  validation?: {
    // Whether the SKILL.md manifest is structurally valid (required fields
    // present, etc.) — independent of the security scan (`scan.is_safe`/`findings`).
    passed?: boolean;
    problems?: ValidationProblem[];
  };
  scan?: {
    verdict?: string;
    // The scanner's own verdict on whether findings pass its internal minimum
    // severity — independent of our SKILL_SCANNER_MIN_SEVERITY, which we apply
    // separately to `findings` via blockingFindings().
    is_safe?: boolean;
    max_severity?: string;
    findings?: ScanFinding[];
  };
  passed?: boolean;
  error?: {
    message?: string;
  };
  message?: string;
  // Some scanner-level rejections (e.g. its own zip-bomb / compression-ratio
  // guard) short-circuit before manifest validation or security scanning even
  // run, and come back as a flat `{ detail: string }` body instead of the
  // usual `{ validation, scan }` shape.
  detail?: string;
};

function severityRank(severity: string | undefined): number {
  if (!severity) {
    return SEVERITY_RANK[UNKNOWN_FINDING_SEVERITY];
  }
  const rank = SEVERITY_RANK[severity.toLowerCase()];
  return typeof rank === 'number' ? rank : SEVERITY_RANK[UNKNOWN_FINDING_SEVERITY];
}

function minSeverityRank(): number {
  const raw = process.env.SKILL_SCANNER_MIN_SEVERITY;
  const rank = raw ? SEVERITY_RANK[raw.toLowerCase()] : undefined;
  return typeof rank === 'number' ? rank : SEVERITY_RANK[DEFAULT_MIN_SEVERITY_THRESHOLD];
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

function nonEmptyString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : undefined;
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

/** Wrap a validation problem string in a normalized issue. */
function problemToIssue(problem: ValidationProblem): SkillScanIssue {
  return { message: problem };
}

// Deloitte Custom Change: Suppress manifest-validation noise for security-only scanner passes.
/**
 * Flatten a scanner response into the list of issues we surface to the user.
 * Collects manifest validation problems first (only when the scan actually
 * requires a manifest — a `requireValidation: false` scan, e.g. a bodyless
 * frontmatter-only pass, has no SKILL.md by design, so its validation
 * problems are expected noise, not a real reason to fail), then blocking
 * security findings, with progressively looser fallbacks so the user always
 * gets *some* reason rather than a generic failure.
 */
function toIssues(
  result: SkillScanResult | undefined,
  requireValidation: boolean,
): SkillScanIssue[] {
  const issues: SkillScanIssue[] = [];

  const validationProblems = requireValidation ? (result?.validation?.problems ?? []) : [];
  for (const problem of validationProblems) {
    issues.push(problemToIssue(problem));
  }

  for (const finding of blockingFindings(result)) {
    const userMessage = nonEmptyString(finding.user_message);
    const description = nonEmptyString(finding.description);
    issues.push({
      code: finding.rule_id,
      severity: finding.severity,
      message: userMessage ?? description ?? 'Skill scan found an issue',
      friendly: userMessage != null,
    });
  }

  if (issues.length > 0) {
    return issues;
  }

  const fallbackMessage =
    result?.message ??
    result?.error?.message ??
    result?.detail ??
    (requireValidation ? 'Skill scan failed due to validation issues' : 'Skill scan failed');
  return [{ message: fallbackMessage }];
}

function buildSkillMarkdown(params: { name: string; description: string; body?: string }): string {
  // Only include fields the external registry allows in its frontmatter schema.
  // LibreChat-internal fields (e.g. always-apply) must be omitted or the
  // scanner will reject the content with an "Unexpected fields" error — they're
  // scanned separately, see `scanFrontmatter`.
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

/**
 * Flatten frontmatter/alwaysApply into plain text for a security-findings-only
 * scan (see {@link scanFrontmatter}). These fields are never scanned as part of
 * the SKILL.md manifest — the external registry's manifest schema rejects any
 * key it doesn't recognize (see {@link buildSkillMarkdown}) — so they'd
 * otherwise bypass the scanner entirely.
 */
function serializeFrontmatterForScan(
  frontmatter: Record<string, unknown> | undefined,
  alwaysApply: boolean | undefined,
): string | undefined {
  const entries = Object.entries(frontmatter ?? {});
  if (alwaysApply !== undefined) {
    entries.push(['alwaysApply', alwaysApply]);
  }
  if (entries.length === 0) {
    return undefined;
  }
  return entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
}

/**
 * Scan frontmatter/alwaysApply for security findings without gating on manifest
 * validation — this isn't a SKILL.md, just arbitrary text, so `requireValidation`
 * stays off (same treatment as {@link scanSkillFileUpload}).
 */
async function scanFrontmatter(
  frontmatter: Record<string, unknown> | undefined,
  alwaysApply: boolean | undefined,
  fileNamePrefix: string,
  token: string | undefined,
): Promise<void> {
  const text = serializeFrontmatterForScan(frontmatter, alwaysApply);
  if (!text) {
    return;
  }
  const archive = await buildSingleFileArchive('frontmatter.txt', Buffer.from(text, 'utf8'));
  await scanArchive(archive, `${fileNamePrefix}.frontmatter.zip`, {
    requireValidation: false,
    token,
  });
}

export function isSkillScanError(error: unknown): error is SkillScanError {
  return error instanceof SkillScanError;
}

export function isSkillScanEnabled(): boolean {
  return (
    typeof process.env.SKILL_SCANNER_URL === 'string' && process.env.SKILL_SCANNER_URL.length > 0
  );
}

type ScanArchiveOptions = {
  /**
   * When true (default), `validation.passed === false` blocks. Set to false
   * for single-file uploads that have no SKILL.md manifest, so only security
   * findings gate the request.
   */
  requireValidation?: boolean;
  /**
   * OBO-derived, user-scoped bearer token to send with the scan request.
   * Omitted when the caller has no OBO token (e.g. non-OpenID users, or
   * before OBO admin consent is granted) — the request then goes unauthenticated.
   */
  token?: string;
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
  const token = options.token;
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
    if (response.ok && !payload) {
      throw new SkillScanError(
        'Skill scan returned an invalid response',
        [{ message: 'Skill scanner did not return a JSON result' }],
        422,
      );
    }

    const validationPassed = payload?.validation?.passed ?? payload?.passed;
    const isSafe = payload?.scan?.is_safe;
    const findings = blockingFindings(payload);

    // Fail-safe: treat `validation.passed === false` as a block regardless of
    // whether the scanner also reported specific problems. `verbose=false`
    // (the only mode any deployed SKILL_SCANNER_URL uses) can omit problem
    // detail, but a missing explanation is not evidence the manifest is valid.
    const validationProblems = payload?.validation?.problems ?? [];
    const validationFailed = requireValidation && validationPassed === false;

    // Fail-safe: require an explicit `scan.is_safe === true` from the scanner
    // — but only when a manifest is required. Without a manifest to anchor a
    // security scan against, the scanner reports `scan: null` (it evaluated
    // nothing, not that it evaluated and found something unsafe), so treating
    // that as a block would mean a `requireValidation: false` scan can never
    // pass against the real scanner.
    // Deloitte Custom Change: Allow non-manifest scans to pass when the scanner returns no verdict.
    const scanEvaluated = payload?.scan != null;
    const scanPassed = isSafe === true;
    const scanFailed = requireValidation ? !scanPassed : scanEvaluated && !scanPassed;

    // Block if any gate trips: HTTP error, a failed manifest validation (only
    // when we require one), a missing/unsafe scan verdict, or a finding at/above
    // the configured severity threshold.
    const failed = !response.ok || validationFailed || scanFailed || findings.length > 0;
    logger.info(
      `[skillScanner] "${fileName}" -> http=${response.status} validationPassed=${validationPassed} ` +
        `validationProblems=${validationProblems.length} isSafe=${isSafe} blockingFindings=${findings.length} verdict=${failed ? 'BLOCK' : 'PASS'}`,
    );

    if (failed) {
      logger.debug(`[skillScanner] "${fileName}" raw response: ${JSON.stringify(payload)}`);
      // Join every issue into one message so callers that only read `.message`
      // still see all reasons; `.issues` carries the structured list for the UI.
      // Deloitte Custom Change: Format issues according to whether manifest validation was required.
      const issues = toIssues(payload, requireValidation);
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
  frontmatter?: Record<string, unknown>;
  alwaysApply?: boolean;
  token?: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const skillMd = buildSkillMarkdown(params);
  const archive = await buildSkillArchive(skillMd);
  await scanArchive(archive, `${params.name}.skill`, { token: params.token });
  // Deloitte Custom Change: Scan only extra frontmatter fields not already present in the generated manifest.
  await scanFrontmatter(
    extraFrontmatterFields(params.frontmatter),
    params.alwaysApply,
    params.name,
    params.token,
  );
}

/**
 * Edit (PATCH) flow: assemble the effective post-update SKILL.md and scan it
 * before the change is persisted.
 */
export async function scanSkillOnUpdate(params: {
  name: string;
  description: string;
  body?: string;
  frontmatter?: Record<string, unknown>;
  alwaysApply?: boolean;
  token?: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const skillMd = buildSkillMarkdown(params);
  const archive = await buildSkillArchive(skillMd);
  await scanArchive(archive, `${params.name}.skill`, { token: params.token });
  // Deloitte Custom Change: Scan only extra frontmatter fields not already present in the generated manifest.
  await scanFrontmatter(
    extraFrontmatterFields(params.frontmatter),
    params.alwaysApply,
    params.name,
    params.token,
  );
}

// Deloitte Custom Change: Remove manifest-owned fields before the frontmatter-only scanner pass.
/**
 * Drop the fields `buildSkillMarkdown` already carries as first-class manifest
 * columns (`name`/`description`) plus `always-apply`/`alwaysApply` (surfaced
 * separately via the parser's own `alwaysApply` field) from a parsed
 * frontmatter bag, leaving only the extra fields that still need a
 * security-only pass through `scanFrontmatter`.
 */
function extraFrontmatterFields(
  frontmatter: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!frontmatter) {
    return undefined;
  }
  const excluded = new Set(['name', 'description', 'always-apply', 'alwaysapply']);
  const entries = Object.entries(frontmatter).filter(([key]) => !excluded.has(key.toLowerCase()));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Unlike the Write-Skill flow — which sends `always-apply` etc. as a
 * structured field never embedded in the scanned manifest — an uploaded
 * SKILL.md carries every frontmatter key inline in its YAML block. The
 * external registry's manifest schema only recognizes name/description, so
 * without this rewrite any upload using a real, LibreChat-supported field
 * like `always-apply` would always be rejected as an "unexpected field",
 * regardless of its value. Parses the uploaded SKILL.md, rebuilds a
 * scanner-safe manifest (name/description + body only, matching
 * `buildSkillMarkdown`), and returns the fields that were stripped out so the
 * caller can still run them through the security-only `scanFrontmatter` pass.
 * Returns `null` when the content can't be parsed (invalid YAML, no
 * frontmatter block) — the caller falls back to scanning the content as-is.
 */
function stripInternalFrontmatterForScan(content: string): {
  skillMd: string;
  frontmatter?: Record<string, unknown>;
  alwaysApply?: boolean;
  name: string;
} | null {
  const parsed = parseSkillMarkdown(content);
  if (parsed.parseError) {
    return null;
  }
  const body = extractSkillBody(content);
  return {
    skillMd: buildSkillMarkdown({ name: parsed.name, description: parsed.description, body }),
    frontmatter: parsed.frontmatter,
    alwaysApply: parsed.alwaysApply,
    name: parsed.name,
  };
}

/**
 * Locate a `SKILL.md` entry at the archive root or one level deep — mirrors
 * the discovery rule `handleZip` (import.ts) uses when it later reads the
 * real archive, so the entry we rewrite here is the same one that flow will
 * treat as the manifest. Also reports the wrapping-folder prefix (e.g.
 * `my-skill/`), so the caller can re-root the archive before scanning — the
 * external scanner requires the manifest at the archive root and rejects a
 * one-level-deep upload as "missing SKILL.md", even though `handleZip` itself
 * tolerates that layout.
 */
function findSkillMdPath(zip: JSZip): { path: string; prefix: string } | null {
  for (const entryPath of Object.keys(zip.files)) {
    const segments = entryPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const basename = segments[segments.length - 1];
    if (basename?.toUpperCase() === SKILL_MD.toUpperCase() && segments.length <= 2) {
      return { path: entryPath, prefix: segments.length === 2 ? `${segments[0]}/` : '' };
    }
  }
  return null;
}

/**
 * Re-root every archive entry under `prefix` to the archive root, mirroring
 * the flattening `handleZip` (import.ts) applies when it later saves
 * companion files — without this, a skill zipped as a wrapping folder (e.g.
 * `my-skill/SKILL.md`) would still have SKILL.md nested one level deep in the
 * archive sent to the external scanner. Entries outside `prefix`
 * (unexpected, but tolerated by `handleZip` too) are kept as-is. Enforces the
 * same per-file/cumulative decompressed-size bounds `handleZip` applies to
 * companion files — returns `null` if any bound is exceeded, so the caller
 * falls back to scanning the original archive unchanged rather than risk
 * unbounded decompression.
 */
async function reRootZip(zip: JSZip, prefix: string): Promise<JSZip | null> {
  const rooted = new JSZip();
  const perFileLimit = DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes;
  let totalDecompressed = 0;
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      continue;
    }
    const normalized = entryPath.replace(/\\/g, '/');
    const isUnderPrefix = normalized.startsWith(prefix);
    const relativePath = isUnderPrefix ? normalized.slice(prefix.length) : normalized;

    // Mirror handleZip's path-safety rules so we don't generate traversal/absolute paths.
    const safePath = relativePath.replace(/^\/+/, '');

    // Match handleZip behavior: when SKILL.md is discovered under `prefix`, ignore any
    // other SKILL.md entries outside that prefix so they can't overwrite the rooted manifest.
    if (!isUnderPrefix && safePath.toUpperCase() === SKILL_MD.toUpperCase()) {
      continue;
    }
    if (
      !safePath ||
      safePath.startsWith('/') ||
      safePath.startsWith('\\') ||
      safePath.split('/').some((seg) => seg === '' || seg === '.' || seg === '..') ||
      !/^[a-zA-Z0-9._\-/]+$/.test(safePath)
    ) {
      continue;
    }

    const cumulativeLimit = DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes - totalDecompressed;
    if (cumulativeLimit <= 0) {
      return null;
    }
    const effectiveLimit = Math.min(perFileLimit, cumulativeLimit);
    const { buffer, bytesRead } = await readZipEntry(entry, effectiveLimit);
    totalDecompressed += bytesRead;
    if (buffer == null) {
      return null;
    }
    rooted.file(safePath, buffer);
  }
  return rooted;
}

/**
 * Rewrite an uploaded archive's SKILL.md to a scanner-safe manifest before
 * scanning, preserving every other entry (companion scripts, references,
 * etc.) byte-for-byte so their content still gets fully security-scanned.
 * Returns `null` when there's no readable/parseable SKILL.md, or when the
 * archive exceeds the same entry-count/decompressed-size bounds `handleZip`
 * (import.ts) enforces — the caller falls back to scanning the original
 * archive unchanged, so a zip-bomb SKILL.md entry can't be used to force an
 * unbounded local decompression ahead of those guards.
 */
async function stripInternalFrontmatterFromZip(zip: JSZip): Promise<{
  zip: JSZip;
  frontmatter?: Record<string, unknown>;
  alwaysApply?: boolean;
  name: string;
} | null> {
  const found = findSkillMdPath(zip);
  if (!found) {
    return null;
  }
  const { path: skillMdPath, prefix } = found;
  const skillMdEntry = zip.file(skillMdPath);
  if (!skillMdEntry) {
    return null;
  }
  const skillMdLimit = Math.min(
    DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes,
    DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes,
  );
  const { buffer: skillMdBuffer } = await readZipEntry(skillMdEntry, skillMdLimit);
  if (!skillMdBuffer) {
    return null;
  }
  const stripped = stripInternalFrontmatterForScan(skillMdBuffer.toString('utf-8'));
  if (!stripped) {
    return null;
  }
  zip.file(skillMdPath, stripped.skillMd);
  const rootedZip = prefix ? await reRootZip(zip, prefix) : zip;
  if (!rootedZip) {
    return null;
  }
  return {
    zip: rootedZip,
    frontmatter: stripped.frontmatter,
    alwaysApply: stripped.alwaysApply,
    name: stripped.name,
  };
}

/**
 * Scan an already-built skill archive (the raw zip/.skill a user uploaded on
 * the import flow). Validation gating stays on — an uploaded skill must have a
 * valid SKILL.md manifest. LibreChat-internal frontmatter fields embedded in
 * the uploaded SKILL.md (e.g. `always-apply`) are stripped from the scanned
 * manifest and re-submitted separately as a security-only pass — see
 * `stripInternalFrontmatterFromZip`.
 */
export async function scanSkillUpload(params: {
  archive: Uint8Array | Buffer;
  fileName: string;
  token?: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const bytes = new Uint8Array(params.archive.length);
  bytes.set(params.archive);

  // Single load — both strip functions operate on the same in-memory JSZip object,
  // eliminating the previous double load/rezip cycle and halving peak memory usage.
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    // Corrupt archive — scan original bytes; the scanner will surface the error.
    await scanArchive(bytes, params.fileName, { token: params.token });
    return;
  }

  // Deloitte Custom Change: Strip unwanted filesystem artifacts in-place before
  // the entry count check so they do not inflate the count toward the limit.
  // Patterns are configured via STRIP_DIR_NAMES and STRIP_BASENAME_PREFIXES in zip.ts.
  stripZipArtifacts(zip);

  // Entry count guard — placed after stripping so the count reflects real skill
  // files only. Sends the original upload bytes rather than re-materialising the
  // in-memory archive, avoiding unnecessary decompression/recompression of a
  // potentially large or malicious archive. handleZip will enforce the same limit.
  if (Object.keys(zip.files).length > DEFAULT_SKILL_IMPORT_LIMITS.maxEntries) {
    await scanArchive(bytes, params.fileName, { token: params.token });
    return;
  }

  const stripped = await stripInternalFrontmatterFromZip(zip);
  if (!stripped) {
    // No parseable SKILL.md or other early exit — scan the original upload bytes
    // directly rather than re-materialising the in-memory archive.
    await scanArchive(bytes, params.fileName, { token: params.token });
    return;
  }

  // Single rezip — owned here after both mutations are complete.
  const cleanArchive = await stripped.zip.generateAsync({ type: 'uint8array' });
  await scanArchive(cleanArchive, params.fileName, { token: params.token });
  await scanFrontmatter(
    extraFrontmatterFields(stripped.frontmatter),
    stripped.alwaysApply,
    stripped.name || params.fileName,
    params.token,
  );
}

/**
 * Scan a raw SKILL.md upload by zipping its content as SKILL.md before sending
 * it to the archive scanner. Validation gating stays on. LibreChat-internal
 * frontmatter fields (e.g. `always-apply`) are stripped from the scanned
 * manifest and re-submitted separately as a security-only pass — see
 * `stripInternalFrontmatterForScan`.
 */
export async function scanSkillMarkdown(params: {
  content: string;
  fileName?: string;
  token?: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const fileName = params.fileName ?? 'SKILL.md.zip';
  const stripped = stripInternalFrontmatterForScan(params.content);
  if (!stripped) {
    const archive = await buildSkillArchive(params.content);
    await scanArchive(archive, fileName, { token: params.token });
    return;
  }
  const archive = await buildSkillArchive(stripped.skillMd);
  await scanArchive(archive, fileName, { token: params.token });
  await scanFrontmatter(
    extraFrontmatterFields(stripped.frontmatter),
    stripped.alwaysApply,
    stripped.name || fileName,
    params.token,
  );
}

/**
 * Scan a single file being added to an existing skill. There is no SKILL.md
 * manifest here, so manifest validation is skipped and only security findings
 * gate the upload.
 */
export async function scanSkillFileUpload(params: {
  fileName: string;
  content: Uint8Array | Buffer;
  token?: string;
}): Promise<void> {
  if (!isSkillScanEnabled()) {
    return;
  }
  const archive = await buildSingleFileArchive(params.fileName, params.content);
  await scanArchive(archive, `${params.fileName}.zip`, {
    requireValidation: false,
    token: params.token,
  });
}
