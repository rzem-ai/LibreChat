import type { AxiosInstance, AxiosResponse } from 'axios';
import { createSSRFSafeAgents, isMCPDomainAllowed } from '~/auth';
import { createAxiosInstance } from '~/utils/axios';

const codeFileDownloadAxios: AxiosInstance = createAxiosInstance();
const CODE_FILE_DOWNLOAD_TIMEOUT_MS = 120_000;
const CODE_FILE_MAX_REDIRECTS = 5;

/**
 * Renders a URL for logging with credentials and query string stripped.
 * These download URLs are short-lived, pre-authorized (signed) SharePoint/
 * Graph links, so their query string (and any userinfo) is a bearer
 * credential in its own right — only the host/path/status are safe to log.
 */
function redactUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[unparseable URL]';
  }
}

/**
 * Streams a codeFile artifact's download URL, re-validating the domain
 * allowlist on every redirect hop. Axios follows redirects by default, which
 * would let an allowed URL 30x to a disallowed/internal address and bypass
 * `isMCPDomainAllowed` entirely, so redirects are followed manually here.
 *
 * `isMCPDomainAllowed` is only a preflight hostname/DNS check; it doesn't
 * protect the TCP connection actually made by axios, so a DNS answer that
 * changes between the check and the request (rebinding) could still land on
 * a private address. `createSSRFSafeAgents` re-validates at connect time —
 * but only when `useSSRFProtection` is on. `MCPServersRegistry.resolveAllowlists`
 * turns it off once an explicit `allowedDomains` allowlist is configured (the
 * admin already vetted those hosts, which may legitimately be private/internal),
 * and every other MCP connection path (`UserConnectionManager`, `MCPManager`,
 * `ConnectionsRepository`) honors that same exemption. Always installing the
 * restrictive agents here would contradict that: an admin-approved internal
 * download host could pass `isMCPDomainAllowed` and still get its connection
 * blocked unless separately listed in `allowedAddresses` too.
 *
 * `proxy` is pinned to whatever `codeFileDownloadAxios` was explicitly
 * configured with (`process.env.proxy` via `createAxiosInstance`), or `false`
 * otherwise: axios silently auto-detects `HTTP_PROXY`/`HTTPS_PROXY`-style env
 * vars when `proxy` is left unset, and in that case the *proxy* — not our
 * SSRF-safe agents — would resolve `currentUrl`'s hostname, bypassing the
 * connect-time recheck entirely. Deployments that deliberately configure
 * `process.env.proxy` for egress still get routed through it.
 */
export async function fetchAllowedCodeFileStream(
  url: string,
  allowedDomains: string[] | null | undefined,
  allowedAddresses: string[] | null | undefined,
): Promise<AxiosResponse> {
  /** Mirrors MCPServersRegistry.resolveAllowlists's useSSRFProtection formula,
   * computed from the same allowedDomains value used by isMCPDomainAllowed
   * below so the preflight check and the connect-time enforcement never
   * disagree about whether this is an admin-vetted allowlist. */
  const useSSRFProtection = !Array.isArray(allowedDomains) || allowedDomains.length === 0;
  const { httpAgent, httpsAgent } = useSSRFProtection
    ? createSSRFSafeAgents(allowedAddresses)
    : { httpAgent: undefined, httpsAgent: undefined };
  let currentUrl = url;
  for (let hop = 0; hop <= CODE_FILE_MAX_REDIRECTS; hop++) {
    if (!(await isMCPDomainAllowed({ url: currentUrl }, allowedDomains, allowedAddresses))) {
      throw new Error(`codeFile download URL domain is not allowed: ${redactUrlForLog(currentUrl)}`);
    }
    const response = await codeFileDownloadAxios.get(currentUrl, {
      responseType: 'stream',
      timeout: CODE_FILE_DOWNLOAD_TIMEOUT_MS,
      maxRedirects: 0,
      proxy: codeFileDownloadAxios.defaults.proxy || false,
      httpAgent,
      httpsAgent,
      validateStatus: (status: number) =>
        (status >= 200 && status < 300) || (status >= 300 && status < 400),
    });
    if (response.status < 300) {
      return response;
    }
    response.data?.destroy?.();
    const location = response.headers?.location;
    if (!location) {
      throw new Error(
        `codeFile download redirected without a Location header: ${redactUrlForLog(currentUrl)}`,
      );
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error(`Too many redirects while downloading codeFile: ${redactUrlForLog(url)}`);
}
