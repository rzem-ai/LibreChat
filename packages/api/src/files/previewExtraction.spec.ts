import fs from 'fs';
import path from 'path';
import { FileContext, FileSources } from 'librechat-data-provider';
import type { FilePreviewCandidate } from './previewExtraction';
import { decideFilePreviewAction, renderFilePreviewText } from './previewExtraction';

const baseFile: FilePreviewCandidate = {
  filename: 'report.docx',
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  bytes: 1024,
  source: FileSources.local,
};

describe('decideFilePreviewAction', () => {
  it('skips a file that already has a status', () => {
    expect(decideFilePreviewAction({ ...baseFile, status: 'ready' })).toBe('skip');
  });

  it('skips a file that already has cached text', () => {
    expect(decideFilePreviewAction({ ...baseFile, text: 'already extracted' })).toBe('skip');
  });

  it('skips OpenAI/Azure-assistants-storage files', () => {
    expect(decideFilePreviewAction({ ...baseFile, source: FileSources.openai })).toBe('skip');
  });

  it('skips execute_code context files (handled by the code-interpreter pipeline)', () => {
    expect(decideFilePreviewAction({ ...baseFile, context: FileContext.execute_code })).toBe(
      'skip',
    );
  });

  /**
   * Regression guard: `source: FileSources.text` marks a record whose `text`
   * field holds the plain-text content fed to the model as file context
   * (`extractFileContext`). `fileAccess` middleware's default query excludes
   * `text` from its projection, so `file.text` can be `undefined` here even
   * when the real DB record has content — without this explicit source
   * check, a preview render would overwrite that context text with
   * rendered HTML (or `null` on failure).
   */
  it('skips FileSources.text records so model-context text is never overwritten', () => {
    expect(decideFilePreviewAction({ ...baseFile, source: FileSources.text })).toBe('skip');
  });

  /**
   * Regression guard: `llmDeliveryPath: 'text'` marks a regular (non-RAG)
   * upload whose `text` field already holds the plain-text content
   * delivered to the model (`resolveUploadLLMDeliveryPath`'s default for
   * non-media MIME types). Same hazard as the `FileSources.text` case
   * above — without this check, an oversized file of this kind would fall
   * through to `too_large` and get marked `failed`, clobbering the text
   * the client's extracted-text preview depends on.
   */
  it('skips llmDeliveryPath text-delivery records so model-context text is never overwritten', () => {
    expect(
      decideFilePreviewAction({
        ...baseFile,
        bytes: 10 * 1024 * 1024,
        llmDeliveryPath: 'text',
      }),
    ).toBe('skip');
  });

  it('skips files with no extractable preview path', () => {
    expect(decideFilePreviewAction({ ...baseFile, filename: 'photo.png', type: 'image/png' })).toBe(
      'skip',
    );
  });

  it('flags oversized files as too_large', () => {
    expect(decideFilePreviewAction({ ...baseFile, bytes: 10 * 1024 * 1024 })).toBe('too_large');
  });

  it('returns extract for a normal, under-cap office file', () => {
    expect(decideFilePreviewAction(baseFile)).toBe('extract');
  });
});

describe('renderFilePreviewText', () => {
  it('renders a real docx buffer to sanitized HTML', async () => {
    const buffer = fs.readFileSync(path.join(__dirname, 'documents', 'sample.docx'));
    const result = await renderFilePreviewText(
      buffer,
      'sample.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.textFormat).toBe('html');
    expect(result.text).toEqual(expect.any(String));
    expect(result.text).toContain('<!DOCTYPE html>');
  });

  it('returns null/null for an unsupported buffer', async () => {
    const result = await renderFilePreviewText(
      Buffer.from([0x00, 0x01, 0x02, 0x03]),
      'photo.png',
      'image/png',
    );
    expect(result.text).toBeNull();
    expect(result.textFormat).toBeNull();
  });
});
