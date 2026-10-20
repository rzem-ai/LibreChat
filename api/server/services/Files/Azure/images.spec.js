// Deloitte Custom Change: regression coverage for private Azure avatar proxy URLs.
jest.mock('sharp', () => jest.fn());
jest.mock('~/models', () => ({ updateUser: jest.fn() }));
jest.mock('@librechat/api', () => ({ invalidateCachedAuthUserDoc: jest.fn() }));
jest.mock('~/cache/getLogStores', () => jest.fn());
jest.mock('./crud', () => ({ saveBufferToAzure: jest.fn() }));

describe('processAzureAvatar', () => {
  const originalPublicAccess = process.env.AZURE_STORAGE_PUBLIC_ACCESS;

  afterEach(() => {
    jest.resetModules();
    if (originalPublicAccess === undefined) {
      delete process.env.AZURE_STORAGE_PUBLIC_ACCESS;
      return;
    }
    process.env.AZURE_STORAGE_PUBLIC_ACCESS = originalPublicAccess;
  });

  it.each([
    ['false', true, '/api/files/images/avatar?file=avatar-file', '&manual=false'],
    ['true', false, 'https://storage.example/avatar.png', '?manual=false'],
  ])(
    'uses the avatar proxy only when public access is %s',
    async (publicAccess, returnProxyPath, downloadURL, querySeparator) => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = publicAccess;
      const sharp = require('sharp');
      const { saveBufferToAzure } = require('./crud');
      const { processAzureAvatar } = require('./images');
      sharp.mockReturnValue({ metadata: jest.fn().mockResolvedValue({ format: 'png' }) });
      saveBufferToAzure.mockResolvedValue(downloadURL);

      const result = await processAzureAvatar({
        buffer: Buffer.from('avatar'),
        userId: 'user-1',
        agentId: 'agent_1',
        manual: 'false',
      });

      expect(saveBufferToAzure).toHaveBeenCalledWith(expect.objectContaining({ returnProxyPath }));
      expect(result).toBe(`${downloadURL}${querySeparator}`);
    },
  );

  it('invalidates the user document cache after updating a manual avatar', async () => {
    const sharp = require('sharp');
    const { updateUser } = require('~/models');
    const { invalidateCachedAuthUserDoc } = require('@librechat/api');
    const getLogStores = require('~/cache/getLogStores');
    const { saveBufferToAzure } = require('./crud');
    const { processAzureAvatar } = require('./images');
    sharp.mockReturnValue({ metadata: jest.fn().mockResolvedValue({ format: 'png' }) });
    saveBufferToAzure.mockResolvedValue('https://storage.example/avatar.png');
    getLogStores.mockReturnValue('auth-user-cache');

    await processAzureAvatar({
      buffer: Buffer.from('avatar'),
      userId: 'user-1',
      manual: 'true',
    });

    expect(updateUser).toHaveBeenCalledWith('user-1', {
      avatar: 'https://storage.example/avatar.png?manual=true',
    });
    expect(invalidateCachedAuthUserDoc).toHaveBeenCalledWith('auth-user-cache', {
      userId: 'user-1',
    });
  });
});
