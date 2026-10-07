const { Readable } = require('stream');

const mockDecideFilePreviewAction = jest.fn(() => 'extract');
const mockRenderFilePreviewText = jest.fn(async () => ({
  text: '<html>preview</html>',
  textFormat: 'html',
}));
jest.mock('@librechat/api', () => ({
  decideFilePreviewAction: (...args) => mockDecideFilePreviewAction(...args),
  renderFilePreviewText: (...args) => mockRenderFilePreviewText(...args),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockUpdateFile = jest.fn().mockResolvedValue({});
jest.mock('~/models', () => ({
  updateFile: (...args) => mockUpdateFile(...args),
}));

const mockGetDownloadStream = jest.fn();
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({ getDownloadStream: mockGetDownloadStream })),
}));

const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { ensureFilePreview } = require('./previewExtraction');

describe('ensureFilePreview', () => {
  const baseFile = {
    file_id: 'file-1',
    filename: 'report.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: 1024,
    source: 'local',
    storageKey: null,
    filepath: '/uploads/report.docx',
  };
  const req = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockDecideFilePreviewAction.mockReturnValue('extract');
    mockRenderFilePreviewText.mockResolvedValue({
      text: '<html>preview</html>',
      textFormat: 'html',
    });
    mockUpdateFile.mockResolvedValue({});
    mockGetDownloadStream.mockImplementation(async () =>
      Readable.from([Buffer.from('PK\x03\x04')]),
    );
    getStrategyFunctions.mockReturnValue({ getDownloadStream: mockGetDownloadStream });
  });

  it('is a no-op when decideFilePreviewAction says skip', async () => {
    mockDecideFilePreviewAction.mockReturnValue('skip');

    const result = await ensureFilePreview({ req, file: baseFile });

    expect(result).toBe(false);
    expect(getStrategyFunctions).not.toHaveBeenCalled();
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('marks oversized files as failed without reading storage, when decided too_large', async () => {
    mockDecideFilePreviewAction.mockReturnValue('too_large');

    const result = await ensureFilePreview({ req, file: baseFile });

    expect(result).toBe(true);
    expect(getStrategyFunctions).not.toHaveBeenCalled();
    expect(mockUpdateFile).toHaveBeenCalledWith({
      file_id: 'file-1',
      status: 'failed',
      previewError: 'file_too_large',
    });
  });

  it('renders and persists a successful extraction', async () => {
    const result = await ensureFilePreview({ req, file: baseFile });

    expect(result).toBe(true);
    expect(getStrategyFunctions).toHaveBeenCalledWith('local');
    expect(mockGetDownloadStream).toHaveBeenCalledWith(req, baseFile.filepath);
    expect(mockRenderFilePreviewText).toHaveBeenCalledWith(
      expect.any(Buffer),
      baseFile.filename,
      baseFile.type,
    );
    expect(mockUpdateFile).toHaveBeenCalledWith({
      file_id: 'file-1',
      text: '<html>preview</html>',
      textFormat: 'html',
      status: 'ready',
      previewError: null,
    });
  });

  it('prefers storageKey over filepath when downloading', async () => {
    await ensureFilePreview({ req, file: { ...baseFile, storageKey: 's3/key.docx' } });

    expect(mockGetDownloadStream).toHaveBeenCalledWith(req, 's3/key.docx');
  });

  it('persists a failed status when rendering returns null (HTML-or-null contract)', async () => {
    mockRenderFilePreviewText.mockResolvedValue({ text: null, textFormat: null });

    await ensureFilePreview({ req, file: baseFile });

    expect(mockUpdateFile).toHaveBeenCalledWith({
      file_id: 'file-1',
      text: null,
      textFormat: null,
      status: 'failed',
      previewError: 'parser-error',
    });
  });

  it('persists a failed status when the storage read throws', async () => {
    mockGetDownloadStream.mockRejectedValue(new Error('storage unavailable'));

    const result = await ensureFilePreview({ req, file: baseFile });

    expect(result).toBe(true);
    expect(mockUpdateFile).toHaveBeenCalledWith({
      file_id: 'file-1',
      status: 'failed',
      previewError: 'unexpected',
    });
  });

  it('is a no-op when the storage source has no download strategy', async () => {
    getStrategyFunctions.mockReturnValue({ getDownloadStream: undefined });

    const result = await ensureFilePreview({ req, file: baseFile });

    expect(result).toBe(false);
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('is a no-op and does not throw when decideFilePreviewAction itself throws', async () => {
    mockDecideFilePreviewAction.mockImplementation(() => {
      throw new Error('malformed file record');
    });

    const result = await ensureFilePreview({ req, file: baseFile });

    expect(result).toBe(false);
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });
});
