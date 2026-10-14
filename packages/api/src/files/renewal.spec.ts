import { handleFileRenewRequest, handleFilesExpiringSoonRequest } from './renewal';

describe('handleFileRenewRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };

  const createDeps = (file: Record<string, unknown> | null = { file_id: 'f1' }) => ({
    updateFileUsage: jest.fn().mockResolvedValue(file),
    fileRetentionHours: 1440,
  });

  it('rejects unauthenticated requests without touching the DB', async () => {
    const deps = createDeps();
    const result = await handleFileRenewRequest({}, { file_id: 'f1' }, deps);
    expect(result).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
    expect(deps.updateFileUsage).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['not a string', { file_id: 42 }],
    ['empty string', { file_id: '' }],
  ])('rejects %s file_id with 400', async (_label, body) => {
    const deps = createDeps();
    const result = await handleFileRenewRequest(user, body, deps);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ code: 'INVALID_FILE_ID' });
    expect(deps.updateFileUsage).not.toHaveBeenCalled();
  });

  it('rejects renewal when independent file retention is not configured', async () => {
    const deps = { updateFileUsage: jest.fn(), fileRetentionHours: undefined };
    const result = await handleFileRenewRequest(user, { file_id: 'f1' }, deps);
    expect(result).toEqual({ status: 400, body: { code: 'RENEWAL_NOT_CONFIGURED' } });
    expect(deps.updateFileUsage).not.toHaveBeenCalled();
  });

  it('renews as an owner-scoped, zero-increment usage touch', async () => {
    const deps = createDeps({ file_id: 'f1', expiredAt: new Date() });
    const result = await handleFileRenewRequest(user, { file_id: 'f1' }, deps);
    expect(deps.updateFileUsage).toHaveBeenCalledWith({
      file_id: 'f1',
      inc: 0,
      user: 'user-1',
      tenantId: 'tenant-1',
      fileRetentionHours: 1440,
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ file: { file_id: 'f1', expiredAt: expect.any(Date) } });
  });

  it('returns 404 when the file does not resolve under the owner scope', async () => {
    const deps = createDeps(null);
    const result = await handleFileRenewRequest(user, { file_id: 'not-owned' }, deps);
    expect(result).toEqual({ status: 404, body: { code: 'FILE_NOT_FOUND' } });
  });
});

describe('handleFilesExpiringSoonRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };

  it('rejects unauthenticated requests without touching the DB', async () => {
    const getFilesExpiringSoon = jest.fn();
    const result = await handleFilesExpiringSoonRequest(
      {},
      { getFilesExpiringSoon, fileRetentionWarningHours: 168 },
    );
    expect(result).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
    expect(getFilesExpiringSoon).not.toHaveBeenCalled();
  });

  it('returns an empty list without querying when independent file retention is not configured', async () => {
    const getFilesExpiringSoon = jest.fn();
    const result = await handleFilesExpiringSoonRequest(user, {
      getFilesExpiringSoon,
      fileRetentionWarningHours: 168,
      fileRetentionHours: undefined,
    });
    expect(result).toEqual({ status: 200, body: { files: [] } });
    expect(getFilesExpiringSoon).not.toHaveBeenCalled();
  });

  it('lists the owner-scoped files within the configured warning window', async () => {
    const files = [{ file_id: 'f1' }];
    const getFilesExpiringSoon = jest.fn().mockResolvedValue(files);
    const result = await handleFilesExpiringSoonRequest(user, {
      getFilesExpiringSoon,
      fileRetentionWarningHours: 168,
      fileRetentionHours: 1440,
    });
    expect(getFilesExpiringSoon).toHaveBeenCalledWith(
      { userId: 'user-1', tenantId: 'tenant-1' },
      168 * 60 * 60 * 1000,
    );
    expect(result).toEqual({ status: 200, body: { files } });
  });
});
