const { Readable } = require('stream');
const { FileSources, FileContext } = require('librechat-data-provider');

const mockClassifyCodeArtifact = jest.fn(() => 'document');
const mockExtractCodeArtifactText = jest.fn(async () => '<html>preview</html>');
const mockGetExtractedTextFormat = jest.fn((_name, _mime, text) => (text == null ? null : 'html'));
const mockHasOfficeHtmlPath = jest.fn(() => true);
jest.mock('@librechat/api', () => ({
  classifyCodeArtifact: (...args) => mockClassifyCodeArtifact(...args),
  extractCodeArtifactText: (...args) => mockExtractCodeArtifactText(...args),
  getExtractedTextFormat: (...args) => mockGetExtractedTextFormat(...args),
  hasOfficeHtmlPath: (...args) => mockHasOfficeHtmlPath(...args),
  MAX_TEXT_EXTRACT_BYTES: 2 * 1024 * 1024,
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
    source: FileSources.local,
    storageKey: null,
    filepath: '/uploads/report.docx',
    context: FileContext.message_attachment,
  };
  const req = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockClassifyCodeArtifact.mockReturnValue('document');
    mockHasOfficeHtmlPath.mockReturnValue(true);
    mockExtractCodeArtifactText.mockResolvedValue('<html>preview</html>');
    mockGetExtractedTextFormat.mockImplementation((_name, _mime, text) =>
      text == null ? null : 'html',
    );
    mockUpdateFile.mockResolvedValue({});
    mockGetDownloadStream.mockImplementation(async () =>
      Readable.from([Buffer.from('PK\x03\x04')]),
    );
    getStrategyFunctions.mockReturnValue({ getDownloadStream: mockGetDownloadStream });
  });

  it('is a no-op when the file already has a status', async () => {
    await ensureFilePreview({ req, file: { ...baseFile, status: 'ready' } });

    expect(getStrategyFunctions).not.toHaveBeenCalled();
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('is a no-op when the file already has cached text', async () => {
    await ensureFilePreview({ req, file: { ...baseFile, text: 'already extracted' } });

    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('skips OpenAI/Azure-assistants-storage files', async () => {
    await ensureFilePreview({ req, file: { ...baseFile, source: FileSources.openai } });

    expect(getStrategyFunctions).not.toHaveBeenCalled();
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('skips execute_code context files (already handled by the code-interpreter pipeline)', async () => {
    await ensureFilePreview({
      req,
      file: { ...baseFile, context: FileContext.execute_code },
    });

    expect(getStrategyFunctions).not.toHaveBeenCalled();
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('skips files with no extractable preview path', async () => {
    mockHasOfficeHtmlPath.mockReturnValue(false);
    mockClassifyCodeArtifact.mockReturnValue('other');

    await ensureFilePreview({
      req,
      file: { ...baseFile, filename: 'photo.png', type: 'image/png' },
    });

    expect(getStrategyFunctions).not.toHaveBeenCalled();
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('marks oversized files as failed without reading storage', async () => {
    await ensureFilePreview({ req, file: { ...baseFile, bytes: 10 * 1024 * 1024 } });

    expect(getStrategyFunctions).not.toHaveBeenCalled();
    expect(mockUpdateFile).toHaveBeenCalledWith({
      file_id: 'file-1',
      status: 'failed',
      previewError: 'file_too_large',
    });
  });

  it('renders and persists a successful extraction', async () => {
    await ensureFilePreview({ req, file: baseFile });

    expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.local);
    expect(mockGetDownloadStream).toHaveBeenCalledWith(req, baseFile.filepath);
    expect(mockExtractCodeArtifactText).toHaveBeenCalledWith(
      expect.any(Buffer),
      baseFile.filename,
      baseFile.type,
      'document',
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

  it('persists a failed status when extraction returns null (HTML-or-null contract)', async () => {
    mockExtractCodeArtifactText.mockResolvedValue(null);

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

    await ensureFilePreview({ req, file: baseFile });

    expect(mockUpdateFile).toHaveBeenCalledWith({
      file_id: 'file-1',
      status: 'failed',
      previewError: 'unexpected',
    });
  });

  it('is a no-op when the storage source has no download strategy', async () => {
    getStrategyFunctions.mockReturnValue({ getDownloadStream: undefined });

    await ensureFilePreview({ req, file: baseFile });

    expect(mockUpdateFile).not.toHaveBeenCalled();
  });
});
