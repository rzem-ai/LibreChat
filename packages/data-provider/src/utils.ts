/**
 * Deloitte Custom Change: Use `[^}]+` instead of a greedy `.+`. A greedy match treats a
 * value with two or more `${VAR}` placeholders (e.g. `${A}?x=${B}`) as one long variable
 * name spanning from the first `${` to the last `}`, fails the env lookup, and returns the
 * string unresolved — silently skipping the multi-placeholder loop in `extractEnvVariable`.
 */
export const envVarRegex = /^\${([^}]+)}$/;

/**
 * Infrastructure env vars that must never be resolved via placeholder expansion.
 * These are internal secrets whose exposure would compromise the system —
 * they have no legitimate reason to appear in outbound headers, MCP env/args, or OAuth config.
 *
 * Intentionally excludes API keys (operators reference them in config) and
 * OAuth/session secrets (referenced in MCP OAuth config via processMCPEnv).
 */
const SENSITIVE_ENV_VARS = new Set([
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CREDS_KEY',
  'CREDS_IV',
  'MEILI_MASTER_KEY',
  'MONGO_URI',
  'REDIS_URI',
  'REDIS_PASSWORD',
]);

/** Returns true when `varName` refers to an infrastructure secret that must not leak. */
export function isSensitiveEnvVar(varName: string): boolean {
  return SENSITIVE_ENV_VARS.has(varName);
}

/** Extracts the environment variable name from a template literal string */
export function extractVariableName(value: string): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(envVarRegex);
  return match ? match[1] : null;
}

/** Extracts the value of an environment variable from a string. */
export function extractEnvVariable(value: string) {
  if (!value) {
    return value;
  }

  const trimmed = value.trim();

  const singleMatch = trimmed.match(envVarRegex);
  if (singleMatch) {
    const varName = singleMatch[1];
    if (isSensitiveEnvVar(varName)) {
      return trimmed;
    }
    return process.env[varName] || trimmed;
  }

  const regex = /\${([^}]+)}/g;
  let result = trimmed;

  const matches = [];
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    matches.push({
      fullMatch: match[0],
      varName: match[1],
      index: match.index,
    });
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, varName, index } = matches[i];
    if (isSensitiveEnvVar(varName)) {
      continue;
    }
    const envValue = process.env[varName] || fullMatch;
    result = result.substring(0, index) + envValue + result.substring(index + fullMatch.length);
  }

  return result;
}

const unresolvedPlaceholderPattern = /\$\{[^}]+\}/;

/**
 * Deloitte Custom Change: Drops query parameters whose value still contains an unresolved
 * `${VAR}` placeholder after `extractEnvVariable` has run. An unset optional env var used
 * in a query string (e.g. `?toolsets=${VAR}`) should mean "parameter omitted", not a
 * literal placeholder forwarded to the server as a meaningless filter value. Leaves the
 * input untouched if it isn't a parseable URL, so callers can surface the real validation
 * error instead.
 */
export function stripUnresolvedPlaceholderQueryParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const staleKeys: string[] = [];
  parsed.searchParams.forEach((value, key) => {
    if (unresolvedPlaceholderPattern.test(value)) {
      staleKeys.push(key);
    }
  });
  if (staleKeys.length === 0) {
    return url;
  }
  staleKeys.forEach((key) => parsed.searchParams.delete(key));

  return parsed.toString();
}

/**
 * Normalize the endpoint name to system-expected value.
 * @param name
 */
export function normalizeEndpointName(name = ''): string {
  return name.toLowerCase() === 'ollama' ? 'ollama' : name;
}
