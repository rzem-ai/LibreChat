const { logger } = require('@librechat/data-schemas');
const {
  classifyCodeArtifact,
  extractCodeArtifactText,
  getExtractedTextFormat,
  MAX_TEXT_EXTRACT_BYTES,
  hasOfficeHtmlPath,
} = require('@librechat/api');
const { FileContext, checkOpenAIStorage } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { updateFile } = require('~/models');

/** Buffers a Node Readable (or any async-iterable stream) into memory. */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * On-demand counterpart to `Code/process.js`'s `finalizePreview`, for files
 * that were never produced by the code-execution pipeline (regular chat
 * attachments, RAG knowledge-base sources). The code-interpreter flow
 * already populates `text`/`textFormat`/`status` at generation time — this
 * fills the same generic fields lazily, on the first `/preview` request, so
 * a second request for the same file is served from the cache instantly.
 *
 * No-ops (leaves `status` unset, same as today) for:
 *  - files that already have a `status` or cached `text` — the fast path
 *  - file types with no inline-preview path (not an office-HTML bucket and
 *    not a recognized text/document category)
 *  - OpenAI/Azure-assistants-storage and execute_code sources — out of
 *    scope here; execute_code files already get a status from the existing
 *    pipeline, and OpenAI-storage downloads need a model-scoped client this
 *    function doesn't have
 *  - files over `MAX_TEXT_EXTRACT_BYTES` — persisted as `failed` so the
 *    route's existing back-compat default doesn't re-attempt on every call
 *
 * Never throws — any unexpected failure (including a malformed file record
 * missing a field classification depends on) is logged and treated as a
 * no-op, same as today's behavior for a type with no preview path.
 *
 * @param {object} params
 * @param {import('express').Request} params.req
 * @param {import('mongoose').Document} params.file - Mongo file record
 *   (e.g. `req.fileAccess.file`).
 * @returns {Promise<boolean>} `true` if a `status`/`text` was persisted
 *   (caller should re-fetch the record), `false` for a no-op.
 */
async function ensureFilePreview({ req, file }) {
  if (file.status != null || file.text != null) {
    return false;
  }
  if (checkOpenAIStorage(file.source) || file.context === FileContext.execute_code) {
    return false;
  }

  /* Decide whether this file is even a candidate for extraction. Kept in
   * its own try/catch, separate from the attempt below: a malformed record
   * (e.g. missing the otherwise-required `type` field) shouldn't persist a
   * `failed` status for a file we never actually tried to render — that
   * would permanently suppress a later, valid attempt once the data is
   * fixed. Silently no-op instead, same as an unsupported file type. */
  let category;
  let getDownloadStream;
  try {
    category = classifyCodeArtifact(file.filename, file.type);
    if (!hasOfficeHtmlPath(file.filename, file.type) && category === 'other') {
      return false;
    }

    if (file.bytes > MAX_TEXT_EXTRACT_BYTES) {
      await updateFile({
        file_id: file.file_id,
        status: 'failed',
        previewError: 'file_too_large',
      });
      return true;
    }

    ({ getDownloadStream } = getStrategyFunctions(file.source));
    if (!getDownloadStream) {
      return false;
    }
  } catch (error) {
    logger.error(`[ensureFilePreview] ${file.file_id}: failed to classify file:`, error);
    return false;
  }

  try {
    const stream = await getDownloadStream(req, file.storageKey || file.filepath);
    const buffer = await streamToBuffer(stream);
    const text = await extractCodeArtifactText(buffer, file.filename, file.type, category);
    const textFormat = getExtractedTextFormat(file.filename, file.type, text);
    await updateFile({
      file_id: file.file_id,
      text,
      textFormat,
      status: text == null ? 'failed' : 'ready',
      previewError: text == null ? 'parser-error' : null,
    });
  } catch (error) {
    logger.error(`[ensureFilePreview] ${file.file_id}: failed to render preview:`, error);
    try {
      await updateFile({ file_id: file.file_id, status: 'failed', previewError: 'unexpected' });
    } catch (persistError) {
      logger.error(
        `[ensureFilePreview] ${file.file_id}: failed to persist failure status:`,
        persistError,
      );
    }
  }
  return true;
}

module.exports = { ensureFilePreview };
