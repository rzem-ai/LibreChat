const { logger } = require('@librechat/data-schemas');
const { decideFilePreviewAction, renderFilePreviewText } = require('@librechat/api');
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
 * Thin orchestration only — classification and rendering are pure,
 * type-checked functions in `@librechat/api` (`decideFilePreviewAction`,
 * `renderFilePreviewText`); this layer just does the I/O those functions
 * can't do themselves: reading storage and persisting the result.
 *
 * @param {object} params
 * @param {import('express').Request} params.req
 * @param {import('mongoose').Document} params.file - Mongo file record
 *   (e.g. `req.fileAccess.file` / `req.liveFile`).
 * @returns {Promise<boolean>} `true` if a `status`/`text` was persisted —
 *   by this call, or by a concurrent call that won the claim race instead
 *   (caller should re-fetch the record either way); `false` for a no-op.
 */
async function ensureFilePreview({ req, file }) {
  let action;
  try {
    action = decideFilePreviewAction(file);
  } catch (error) {
    logger.error(`[ensureFilePreview] ${file.file_id}: failed to classify file:`, error);
    return false;
  }

  if (action === 'skip') {
    return false;
  }

  if (action === 'too_large') {
    await updateFile({
      file_id: file.file_id,
      status: 'failed',
      previewError: 'file_too_large',
    });
    return true;
  }

  let getDownloadStream;
  try {
    ({ getDownloadStream } = getStrategyFunctions(file.source));
  } catch (error) {
    logger.error(`[ensureFilePreview] ${file.file_id}: failed to resolve storage strategy:`, error);
    return false;
  }
  if (!getDownloadStream) {
    return false;
  }

  /* Atomically claim the record before downloading/rendering: concurrent
   * first-requests for the same file (two citations, owner + shared-link,
   * etc.) would otherwise all observe an unset status and redundantly
   * download and render the same file. The conditional update below only
   * commits for whichever request gets here first; everyone else loses the
   * race (`claimed` is `null`) and defers to that request — still
   * returning `true` so the caller re-fetches and sees the now-persisted
   * `pending` status to poll on, instead of racing storage/render again. */
  const claimed = await updateFile(
    { file_id: file.file_id, status: 'pending' },
    { status: { $exists: false }, text: { $exists: false } },
  );
  if (!claimed) {
    return true;
  }

  try {
    const stream = await getDownloadStream(req, file.storageKey || file.filepath);
    const buffer = await streamToBuffer(stream);
    const { text, textFormat } = await renderFilePreviewText(buffer, file.filename, file.type);
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
