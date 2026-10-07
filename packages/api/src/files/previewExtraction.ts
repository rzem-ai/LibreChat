import { FileContext, FileSources, checkOpenAIStorage } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import {
  classifyCodeArtifact,
  extractCodeArtifactText,
  getExtractedTextFormat,
  hasOfficeHtmlPath,
  MAX_TEXT_EXTRACT_BYTES,
} from '~/files/code';

/**
 * Minimal shape `decideFilePreviewAction` needs from a Mongo file record.
 * Callers typically pass an `IMongoFile` (or the reduced projection
 * `fileAccess`/`resolveShareFile` middleware attach to the request), so this
 * is a subset rather than the full type.
 */
export type FilePreviewCandidate = Pick<
  IMongoFile,
  'filename' | 'type' | 'bytes' | 'source' | 'context' | 'status' | 'text'
>;

export type FilePreviewAction = 'skip' | 'too_large' | 'extract';

/**
 * Decide whether an on-demand preview render should be attempted for a
 * stored file, without touching storage or the database — pure
 * classification so the caller (JS orchestration layer) can unit-test and
 * type-check this decision independently of I/O.
 *
 * `'skip'` cases:
 *  - `status`/`text` already set — fast path, something already rendered
 *    (code-interpreter pipeline, or a prior call to this same flow).
 *  - OpenAI/Azure-assistants-storage or `execute_code` context — out of
 *    scope (execute_code already gets a status from its own pipeline;
 *    OpenAI storage needs a model-scoped client this flow doesn't have).
 *  - `source === FileSources.text` — this marks a record whose `text`
 *    field holds the plain-text content fed to the model as file context
 *    (see `extractFileContext` in `~/files/context`), extracted at upload
 *    time. Some callers (e.g. `fileAccess` middleware's default query)
 *    exclude `text` from their projection for bandwidth, so `file.text`
 *    can be `undefined` here even though the DB record has real content —
 *    the explicit source check is the actual guard against overwriting it
 *    with rendered preview HTML (or `null` on a failed render).
 *  - No extractable preview path (not an office-HTML bucket and not a
 *    recognized text/document category).
 *
 * `'too_large'`: exceeds `MAX_TEXT_EXTRACT_BYTES` — caller should persist a
 * `failed`/`file_too_large` status without reading the file into memory.
 *
 * `'extract'`: caller should fetch the file's bytes and call
 * {@link renderFilePreviewText}.
 */
export function decideFilePreviewAction(file: FilePreviewCandidate): FilePreviewAction {
  if (file.status != null || file.text != null) {
    return 'skip';
  }
  if (
    checkOpenAIStorage(file.source) ||
    file.context === FileContext.execute_code ||
    file.source === FileSources.text
  ) {
    return 'skip';
  }
  const category = classifyCodeArtifact(file.filename, file.type);
  if (!hasOfficeHtmlPath(file.filename, file.type) && category === 'other') {
    return 'skip';
  }
  if (file.bytes > MAX_TEXT_EXTRACT_BYTES) {
    return 'too_large';
  }
  return 'extract';
}

/** Result of rendering a file's buffer for inline preview. */
export interface FilePreviewRenderResult {
  text: string | null;
  textFormat: 'html' | 'text' | null;
}

/**
 * Render a file buffer into preview text/HTML, reusing the same
 * classify → extract → format pipeline the code-interpreter deferred-preview
 * flow uses (`~/files/code`). Never throws — `extractCodeArtifactText`
 * already swallows its own errors and returns `null`.
 */
export async function renderFilePreviewText(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<FilePreviewRenderResult> {
  const category = classifyCodeArtifact(filename, mimeType);
  const text = await extractCodeArtifactText(buffer, filename, mimeType, category);
  const textFormat = getExtractedTextFormat(filename, mimeType, text);
  return { text, textFormat };
}
