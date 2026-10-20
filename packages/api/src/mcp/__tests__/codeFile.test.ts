// Deloitte Custom Change: covers secure MCP download handoff to Code Interpreter.
import type { AxiosRequestConfig } from 'axios';
import { PassThrough, Readable } from 'node:stream';

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }),
  { virtual: true },
);

jest.mock('~/utils/axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    defaults: { proxy: false as false | Record<string, unknown> },
  };
  return {
    createAxiosInstance: jest.fn(() => mockAxiosInstance),
    __mockAxiosInstance: mockAxiosInstance,
  };
});

const mockGetProxyUrlForUrl = jest.fn(() => undefined);
const mockApplyAxiosProxyConfig = jest.fn((config: AxiosRequestConfig) => config);

jest.mock('~/utils/proxy', () => {
  return {
    getProxyUrlForUrl: (...args: unknown[]) => mockGetProxyUrlForUrl(...args),
    applyAxiosProxyConfig: (...args: unknown[]) => mockApplyAxiosProxyConfig(...args),
  };
});

const mockIsMCPDomainAllowed = jest.fn(async () => true);
const mockIsAddressAllowed = jest.fn(() => false);
const mockCreateSSRFSafeAgents = jest.fn(() => ({ httpAgent: undefined, httpsAgent: undefined }));
const mockIsSSRFTarget = jest.fn(() => false);
const mockResolveHostnameSSRF = jest.fn(async () => false);
const mockGetEffectivePort = jest.fn(
  (protocol: string, port: string) => port || (protocol === 'https:' ? '443' : '80'),
);
const mockIsPrivateIP = jest.fn((hostname: string) => hostname === '169.254.169.254');

jest.mock('~/auth', () => {
  return {
    isMCPDomainAllowed: (...args: unknown[]) => mockIsMCPDomainAllowed(...args),
    isAddressAllowed: (...args: unknown[]) => mockIsAddressAllowed(...args),
    createSSRFSafeAgents: (...args: unknown[]) => mockCreateSSRFSafeAgents(...args),
    isSSRFTarget: (...args: unknown[]) => mockIsSSRFTarget(...args),
    resolveHostnameSSRF: (...args: unknown[]) => mockResolveHostnameSSRF(...args),
    getEffectivePort: (...args: unknown[]) => mockGetEffectivePort(...args),
    isPrivateIP: (...args: unknown[]) => mockIsPrivateIP(...args),
  };
});

import { fetchAllowedCodeFileStream } from '~/mcp/codeFile';

const { __mockAxiosInstance: mockAxiosInstance } = jest.requireMock('~/utils/axios') as {
  __mockAxiosInstance: { get: jest.Mock; defaults: { proxy: false | Record<string, unknown> } };
};
const mockGet = mockAxiosInstance.get;

/** Deloitte Custom Change: creates valid gateway grants without a fixed-date test expiry. */
function futureExpiry(): string {
  return new Date(Date.now() + 60_000).toISOString();
}

describe('fetchAllowedCodeFileStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockIsMCPDomainAllowed.mockResolvedValue(true);
    mockIsAddressAllowed.mockReturnValue(false);
    mockIsSSRFTarget.mockReturnValue(false);
    mockResolveHostnameSSRF.mockResolvedValue(false);
    mockGetEffectivePort.mockImplementation(
      (protocol: string, port: string) => port || (protocol === 'https:' ? '443' : '80'),
    );
    mockIsPrivateIP.mockImplementation((hostname: string) => hostname === '169.254.169.254');
    mockGetProxyUrlForUrl.mockReturnValue(undefined);
    mockApplyAxiosProxyConfig.mockImplementation((config: AxiosRequestConfig) => config);
    mockAxiosInstance.defaults.proxy = false;
  });

  it('passes the effective port through to the allowedAddresses exemption check', async () => {
    mockGetProxyUrlForUrl.mockReturnValue('http://corp-proxy.internal:8080');
    mockIsAddressAllowed.mockReturnValue(true);
    mockGet.mockResolvedValue({ status: 200, data: 'stream' });

    await fetchAllowedCodeFileStream('https://internal.example/report.pdf', null, [
      'internal.example:443',
    ]);

    expect(mockIsAddressAllowed).toHaveBeenCalledWith(
      'internal.example',
      ['internal.example:443'],
      '443',
    );
  });

  it('rejects an expired gateway grant before making a request', async () => {
    await expect(
      fetchAllowedCodeFileStream('https://gateway.example/download/grant', null, null, {
        size: 42,
        expiresAt: '2020-01-01T00:00:00Z',
      }),
    ).rejects.toThrow('invalid or expired');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rejects a mismatched content length and closes the gateway response stream', async () => {
    const upstream = new PassThrough();
    mockGet.mockResolvedValue({
      status: 200,
      headers: { 'content-length': '4' },
      data: upstream,
    });

    await expect(
      fetchAllowedCodeFileStream('https://gateway.example/download/grant', null, null, {
        size: 42,
        expiresAt: futureExpiry(),
      }),
    ).rejects.toThrow('does not match the gateway-declared size');

    expect(upstream.destroyed).toBe(true);
  });

  it('rejects a response stream that exceeds the gateway-declared size', async () => {
    mockGet.mockResolvedValue({ status: 200, headers: {}, data: Readable.from(['oversized']) });

    const response = await fetchAllowedCodeFileStream(
      'https://gateway.example/download/grant',
      null,
      null,
      { size: 4, expiresAt: futureExpiry() },
    );

    const consume = async () => {
      for await (const _chunk of response.data) {
        // Consume the limiter so it can enforce the byte budget.
      }
    };
    await expect(consume()).rejects.toThrow('exceeds the gateway-declared size');
  });

  it('rejects a truncated response stream', async () => {
    mockGet.mockResolvedValue({ status: 200, headers: {}, data: Readable.from(['short']) });

    const response = await fetchAllowedCodeFileStream(
      'https://gateway.example/download/grant',
      null,
      null,
      { size: 6, expiresAt: futureExpiry() },
    );

    const consume = async () => {
      for await (const _chunk of response.data) {
        // Consume the limiter so it can enforce the byte budget.
      }
    };
    await expect(consume()).rejects.toThrow('does not match the gateway-declared size');
  });

  // Deloitte Custom Change: downstream rejection must release the upstream gateway response stream.
  it('closes the upstream stream when the gateway limiter is destroyed', async () => {
    const upstream = new PassThrough();
    mockGet.mockResolvedValue({ status: 200, headers: {}, data: upstream });

    const response = await fetchAllowedCodeFileStream(
      'https://gateway.example/download/grant',
      null,
      null,
      { size: 42, expiresAt: futureExpiry() },
    );

    const upstreamClosed = new Promise<void>((resolve) => upstream.once('close', resolve));
    response.data.destroy();
    await upstreamClosed;

    expect(upstream.destroyed).toBe(true);
  });

  it('rejects a proxied hostname when allowedAddresses does not match the effective port', async () => {
    mockGetProxyUrlForUrl.mockReturnValue('http://corp-proxy.internal:8080');
    mockIsAddressAllowed.mockReturnValue(false);

    await expect(
      fetchAllowedCodeFileStream('https://internal.example/report.pdf', null, [
        'internal.example:8443',
      ]),
    ).rejects.toThrow(/requires an IP-literal or explicitly allowed host/);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('allows a public IPv6-literal host under a configured proxy without treating it as a hostname', async () => {
    mockGetProxyUrlForUrl.mockReturnValue('http://corp-proxy.internal:8080');
    mockGet.mockResolvedValue({ status: 200, data: 'stream' });

    await expect(
      fetchAllowedCodeFileStream('https://[2001:db8::1]/report.pdf', null, null),
    ).resolves.toEqual({ status: 200, data: 'stream' });
    expect(mockIsAddressAllowed).toHaveBeenCalledWith('[2001:db8::1]', null, '443');
  });

  it('rejects a private IP literal under a configured proxy unless explicitly allowed', async () => {
    mockGetProxyUrlForUrl.mockReturnValue('http://corp-proxy.internal:8080');

    await expect(
      fetchAllowedCodeFileStream('https://169.254.169.254/latest/meta-data', null, null),
    ).rejects.toThrow(/requires an IP-literal or explicitly allowed host/);

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not build connect-time SSRF agents when proxy env resolution routes the request through a proxy', async () => {
    mockGetProxyUrlForUrl.mockReturnValue('http://corp-proxy.internal:8080');
    mockIsAddressAllowed.mockReturnValue(true);
    mockApplyAxiosProxyConfig.mockImplementation((config: AxiosRequestConfig) => ({
      ...config,
      proxy: false,
      httpsAgent: 'proxy-agent',
    }));
    mockGet.mockResolvedValue({ status: 200, data: 'stream' });

    await fetchAllowedCodeFileStream('https://internal.example/report.pdf', null, [
      'internal.example:443',
    ]);

    expect(mockCreateSSRFSafeAgents).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ httpAgent: undefined, httpsAgent: 'proxy-agent', proxy: false }),
    );
  });

  it('builds connect-time SSRF agents when there is no proxy configured', async () => {
    mockAxiosInstance.defaults.proxy = false;
    mockGet.mockResolvedValue({ status: 200, data: 'stream' });

    await fetchAllowedCodeFileStream('https://contoso.sharepoint.com/report.pdf', null, null);

    expect(mockCreateSSRFSafeAgents).toHaveBeenCalledWith(null);
  });

  it('drops the allowedAddresses exemption once a redirect crosses origin', async () => {
    mockGet
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: 'https://attacker.example/report.pdf' },
        data: { destroy: jest.fn() },
      })
      .mockResolvedValueOnce({ status: 200, data: 'stream' });

    await fetchAllowedCodeFileStream('https://internal.example/report.pdf', null, [
      'internal.example:443',
      'attacker.example:443',
    ]);

    expect(mockIsMCPDomainAllowed).toHaveBeenNthCalledWith(
      1,
      { url: 'https://internal.example/report.pdf' },
      null,
      ['internal.example:443', 'attacker.example:443'],
    );
    expect(mockIsMCPDomainAllowed).toHaveBeenNthCalledWith(
      2,
      { url: 'https://attacker.example/report.pdf' },
      null,
      null,
    );
    expect(mockCreateSSRFSafeAgents).toHaveBeenNthCalledWith(1, [
      'internal.example:443',
      'attacker.example:443',
    ]);
    expect(mockCreateSSRFSafeAgents).toHaveBeenNthCalledWith(2, null);
  });

  it('keeps the allowedAddresses exemption across a same-origin redirect', async () => {
    mockGet
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: 'https://internal.example/renamed.pdf' },
        data: { destroy: jest.fn() },
      })
      .mockResolvedValueOnce({ status: 200, data: 'stream' });

    await fetchAllowedCodeFileStream('https://internal.example/report.pdf', null, [
      'internal.example:443',
    ]);

    expect(mockCreateSSRFSafeAgents).toHaveBeenNthCalledWith(2, ['internal.example:443']);
  });

  it('allows a same-origin redirect on an allowlisted host even when DNS resolves private', async () => {
    mockResolveHostnameSSRF.mockResolvedValue(true);
    mockGet
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: 'https://internal.example/renamed.pdf' },
        data: { destroy: jest.fn() },
      })
      .mockResolvedValueOnce({ status: 200, data: 'stream' });

    await expect(
      fetchAllowedCodeFileStream(
        'https://internal.example/report.pdf',
        ['https://internal.example'],
        null,
      ),
    ).resolves.toEqual({ status: 200, data: 'stream' });

    expect(mockResolveHostnameSSRF).not.toHaveBeenCalled();
  });

  it('re-resolves proxy routing on each redirect hop', async () => {
    mockGetProxyUrlForUrl.mockImplementation((targetUrl?: string | URL) =>
      String(targetUrl).includes('203.0.113.10') ? 'http://corp-proxy.internal:8080' : undefined,
    );
    mockApplyAxiosProxyConfig.mockImplementation(
      (config: AxiosRequestConfig, targetUrl?: string | URL) =>
        String(targetUrl).includes('203.0.113.10')
          ? {
              ...config,
              proxy: false,
              httpsAgent: 'proxy-agent',
            }
          : config,
    );
    mockGet
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: 'https://203.0.113.10/report.pdf' },
        data: { destroy: jest.fn() },
      })
      .mockResolvedValueOnce({ status: 200, data: 'stream' });

    await fetchAllowedCodeFileStream(
      'https://contoso.sharepoint.com/report.pdf',
      ['https://contoso.sharepoint.com', 'https://203.0.113.10'],
      null,
    );

    expect(mockGetProxyUrlForUrl).toHaveBeenNthCalledWith(
      1,
      'https://contoso.sharepoint.com/report.pdf',
    );
    expect(mockGetProxyUrlForUrl).toHaveBeenNthCalledWith(2, 'https://203.0.113.10/report.pdf');
    expect(mockCreateSSRFSafeAgents).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      'https://203.0.113.10/report.pdf',
      expect.objectContaining({ proxy: false, httpsAgent: 'proxy-agent' }),
    );
  });

  it('rejects a proxied cross-origin redirect to a private target', async () => {
    const destroy = jest.fn();
    mockGetProxyUrlForUrl.mockImplementation((targetUrl?: string | URL) =>
      String(targetUrl).includes('169.254.169.254') ? 'http://corp-proxy.internal:8080' : undefined,
    );
    mockIsSSRFTarget.mockImplementation((hostname: string) => hostname === '169.254.169.254');
    mockGet.mockResolvedValue({
      status: 302,
      headers: { location: 'https://169.254.169.254/latest/meta-data' },
      data: { destroy },
    });

    await expect(
      fetchAllowedCodeFileStream('https://contoso.sharepoint.com/report.pdf', null, null),
    ).rejects.toThrow(/redirect target is private or reserved/);

    expect(mockGetProxyUrlForUrl).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects a redirect to a private/reserved target even when allowlist mode is active', async () => {
    const destroy = jest.fn();
    mockIsSSRFTarget.mockImplementation((hostname: string) => hostname === '169.254.169.254');
    mockGet.mockResolvedValue({
      status: 302,
      headers: { location: 'https://169.254.169.254/latest/meta-data' },
      data: { destroy },
    });

    await expect(
      fetchAllowedCodeFileStream(
        'https://contoso.sharepoint.com/report.pdf',
        ['https://contoso.sharepoint.com', 'https://169.254.169.254'],
        null,
      ),
    ).rejects.toThrow(/redirect target is private or reserved/);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects a redirect whose allowlisted hostname resolves to a private address', async () => {
    const destroy = jest.fn();
    mockResolveHostnameSSRF.mockResolvedValue(true);
    mockGet.mockResolvedValue({
      status: 302,
      headers: { location: 'https://internal.example/report.pdf' },
      data: { destroy },
    });

    await expect(
      fetchAllowedCodeFileStream(
        'https://contoso.sharepoint.com/report.pdf',
        ['https://contoso.sharepoint.com', 'https://internal.example'],
        null,
      ),
    ).rejects.toThrow(/redirect target is private or reserved/);

    expect(mockResolveHostnameSSRF).toHaveBeenCalledWith('internal.example');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects an HTTPS redirect to HTTP before requesting the insecure target', async () => {
    const destroy = jest.fn();
    mockGet.mockResolvedValue({
      status: 302,
      headers: { location: 'http://contoso.sharepoint.com/report.pdf' },
      data: { destroy },
    });

    await expect(
      fetchAllowedCodeFileStream('https://contoso.sharepoint.com/report.pdf', null, null),
    ).rejects.toThrow(/cannot redirect from HTTPS to an insecure protocol/);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects non-HTTPS download URLs before validating or requesting them', async () => {
    await expect(
      fetchAllowedCodeFileStream('http://contoso.sharepoint.com/report.pdf', null, null),
    ).rejects.toThrow(/must use HTTPS/);

    expect(mockIsMCPDomainAllowed).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('destroys the response stream when the download rejects with a non-2xx/3xx status', async () => {
    const destroy = jest.fn();
    const axiosError = Object.assign(new Error('Request failed with status code 403'), {
      response: { status: 403, data: { destroy } },
    });
    mockGet.mockRejectedValue(axiosError);

    await expect(
      fetchAllowedCodeFileStream('https://contoso.sharepoint.com/report.pdf', null, null),
    ).rejects.toThrow('Request failed with status code 403');

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
