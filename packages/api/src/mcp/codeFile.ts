import { isIP } from 'node:net';
import type { AxiosInstance, AxiosResponse } from 'axios';
import {
  isAddressAllowed,
  isMCPDomainAllowed,
  isSSRFTarget,
  createSSRFSafeAgents,
  getEffectivePort,
  isPrivateIP,
  resolveHostnameSSRF,
} from '~/auth';
import { createAxiosInstance } from '~/utils/axios';
import { applyAxiosProxyConfig, getProxyUrlForUrl } from '~/utils/proxy';

// Deloitte Custom Change: Securely bridge MCP download resources into Code Interpreter.
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
 * Proxy routing is resolved per hop through the shared proxy helpers so
 * `PROXY`/`proxy` and standard `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`
 * environment settings all behave the same way they do elsewhere in the app.
 * When SSRF protection is on and a proxy would be used, the proxy — not our
 * connect-time agents — resolves `currentUrl`'s hostname, so those agents
 * cannot catch a private address the proxy's resolver returns (DNS rebinding).
 * `assertHopSafeForProxy` closes that gap the same way
 * `assertProxiedRequestTargetAllowed` does for MCP server connections in
 * `connection.ts`: a proxied hop under SSRF protection must target an IP
 * literal (checked for privateness like any other target) or an
 * admin-exempted `allowedAddresses` entry — an admin who wants to reach a
 * named host (e.g. their tenant's SharePoint domain) through the proxy should
 * add it to `allowedDomains`, which turns `useSSRFProtection` off for this
 * call the same way it does for every other MCP connection path.
 */
function assertHopSafeForProxy(
  hostname: string,
  port: string,
  proxyConfigured: boolean,
  useSSRFProtection: boolean,
  allowedAddresses: string[] | null | undefined,
): void {
  /** `URL.hostname` keeps the brackets around an IPv6 literal (e.g.
   * `[2001:db8::1]`), but `node:net.isIP` doesn't accept them — strip them
   * first so a public IPv6 download target isn't misclassified as a
   * hostname and rejected. */
  const unbracketedHostname = hostname.replace(/^\[|\]$/g, '');
  if (!proxyConfigured || !useSSRFProtection) {
    return;
  }
  if (isAddressAllowed(hostname, allowedAddresses, port)) {
    return;
  }
  if (isIP(unbracketedHostname) !== 0 && !isPrivateIP(unbracketedHostname)) {
    return;
  }
  throw new Error(
    `codeFile download via a configured proxy requires an IP-literal or explicitly allowed host while SSRF protection is on: ${hostname}`,
  );
}

async function assertRedirectTargetSafe(url: string): Promise<void> {
  const hostname = new URL(url).hostname;
  if (isSSRFTarget(hostname) || (await resolveHostnameSSRF(hostname))) {
    throw new Error(
      `codeFile download redirect target is private or reserved: ${redactUrlForLog(url)}`,
    );
  }
}

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
  /** Shared across every hop (rather than reset per hop) so a chain of slow
   * redirects can't run the timeout up to `CODE_FILE_MAX_REDIRECTS *
   * CODE_FILE_DOWNLOAD_TIMEOUT_MS` before failing. */
  const deadline = Date.now() + CODE_FILE_DOWNLOAD_TIMEOUT_MS;
  const originalOrigin = new URL(url).origin;
  /** Sticky once a server-controlled redirect crosses origin, mirroring
   * `connection.ts`'s cross-origin redirect handling: `allowedAddresses` is
   * an admin exemption scoped to the originally-configured URL, not a grant
   * that should follow wherever a redirect chain leads. Without this, a
   * `Location` header could redirect an approved endpoint to a different
   * private host/port that also happens to be on the exemption list. */
  let crossOriginSeen = false;
  let currentUrl = url;
  for (let hop = 0; hop <= CODE_FILE_MAX_REDIRECTS; hop++) {
    const parsedUrl = new URL(currentUrl);
    const isCrossOriginRedirect = hop > 0 && parsedUrl.origin !== originalOrigin;
    const proxyConfigured = Boolean(getProxyUrlForUrl(currentUrl));
    if (parsedUrl.protocol !== 'https:') {
      throw new Error(`codeFile download URL must use HTTPS: ${redactUrlForLog(currentUrl)}`);
    }
    if (isCrossOriginRedirect) {
      await assertRedirectTargetSafe(currentUrl);
    }
    if (isCrossOriginRedirect) {
      crossOriginSeen = true;
    }
    const effectiveAllowedAddresses = crossOriginSeen ? null : allowedAddresses;
    const enforceRedirectSSRFProtection = useSSRFProtection || crossOriginSeen;
    if (
      !(await isMCPDomainAllowed({ url: currentUrl }, allowedDomains, effectiveAllowedAddresses))
    ) {
      throw new Error(
        `codeFile download URL domain is not allowed: ${redactUrlForLog(currentUrl)}`,
      );
    }
    assertHopSafeForProxy(
      parsedUrl.hostname,
      getEffectivePort(parsedUrl.protocol, parsedUrl.port),
      proxyConfigured,
      enforceRedirectSSRFProtection,
      effectiveAllowedAddresses,
    );
    /** Connect-time agents validate whatever hostname axios actually dials — the
     * real target when unproxied, but the *proxy's own* address once a proxy is
     * configured (axios rewrites `options.hostname` to the proxy for plaintext
     * HTTP, and swaps in its own CONNECT-tunneling agent entirely for HTTPS, so
     * `httpsAgent` never even runs). Attaching them in the proxied case doesn't
     * protect the download target — it just risks blocking a legitimate
     * corporate proxy that happens to live on a private address. `assertHopSafeForProxy`
     * is the sole SSRF gate once a proxy is in play, so the agents are only
     * built for the direct-connection path. Rebuilt every hop so a cross-origin
     * redirect's dropped exemption also applies at the connect-time layer. */
    const { httpAgent, httpsAgent } =
      enforceRedirectSSRFProtection && !proxyConfigured
        ? createSSRFSafeAgents(effectiveAllowedAddresses)
        : { httpAgent: undefined, httpsAgent: undefined };
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`codeFile download timed out following redirects: ${redactUrlForLog(url)}`);
    }
    let response: AxiosResponse;
    try {
      response = await codeFileDownloadAxios.get(currentUrl, {
        ...applyAxiosProxyConfig(
          {
            responseType: 'stream',
            timeout: remainingMs,
            maxRedirects: 0,
            httpAgent,
            httpsAgent,
            validateStatus: (status: number) =>
              (status >= 200 && status < 300) || (status >= 300 && status < 400),
          },
          currentUrl,
        ),
      });
    } catch (error) {
      (error as { response?: AxiosResponse })?.response?.data?.destroy?.();
      throw error;
    }
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
    const redirectUrl = new URL(location, currentUrl);
    if (parsedUrl.protocol === 'https:' && redirectUrl.protocol !== 'https:') {
      throw new Error(
        `codeFile download cannot redirect from HTTPS to an insecure protocol: ${redactUrlForLog(redirectUrl.toString())}`,
      );
    }
    currentUrl = redirectUrl.toString();
  }
  throw new Error(`Too many redirects while downloading codeFile: ${redactUrlForLog(url)}`);
}
