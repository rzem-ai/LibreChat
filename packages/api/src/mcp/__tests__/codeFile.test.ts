jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

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

const mockIsMCPDomainAllowed = jest.fn(async () => true);
const mockIsAddressAllowed = jest.fn(() => false);
const mockCreateSSRFSafeAgents = jest.fn(() => ({ httpAgent: undefined, httpsAgent: undefined }));

jest.mock('~/auth', () => {
  const actual = jest.requireActual('~/auth');
  return {
    ...actual,
    isMCPDomainAllowed: (...args: unknown[]) => mockIsMCPDomainAllowed(...args),
    isAddressAllowed: (...args: unknown[]) => mockIsAddressAllowed(...args),
    createSSRFSafeAgents: (...args: unknown[]) => mockCreateSSRFSafeAgents(...args),
  };
});

import { fetchAllowedCodeFileStream } from '~/mcp/codeFile';

const { __mockAxiosInstance: mockAxiosInstance } = jest.requireMock('~/utils/axios') as {
  __mockAxiosInstance: { get: jest.Mock; defaults: { proxy: false | Record<string, unknown> } };
};
const mockGet = mockAxiosInstance.get;

describe('fetchAllowedCodeFileStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMCPDomainAllowed.mockResolvedValue(true);
    mockIsAddressAllowed.mockReturnValue(false);
    mockAxiosInstance.defaults.proxy = false;
  });

  it('passes the effective port through to the allowedAddresses exemption check', async () => {
    mockAxiosInstance.defaults.proxy = { host: 'corp-proxy.internal', port: 8080 };
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

  it('rejects a proxied hostname when allowedAddresses does not match the effective port', async () => {
    mockAxiosInstance.defaults.proxy = { host: 'corp-proxy.internal', port: 8080 };
    mockIsAddressAllowed.mockReturnValue(false);

    await expect(
      fetchAllowedCodeFileStream('https://internal.example/report.pdf', null, [
        'internal.example:8443',
      ]),
    ).rejects.toThrow(/requires an IP-literal or explicitly allowed host/);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('allows a public IPv6-literal host under a configured proxy without treating it as a hostname', async () => {
    mockAxiosInstance.defaults.proxy = { host: 'corp-proxy.internal', port: 8080 };
    mockGet.mockResolvedValue({ status: 200, data: 'stream' });

    await expect(
      fetchAllowedCodeFileStream('https://[2001:db8::1]/report.pdf', null, null),
    ).resolves.toEqual({ status: 200, data: 'stream' });
    expect(mockIsAddressAllowed).not.toHaveBeenCalled();
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
