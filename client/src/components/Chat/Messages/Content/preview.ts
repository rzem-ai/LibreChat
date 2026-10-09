import { FileSources } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';

type PreviewKind = 'pdf' | 'text' | 'office' | false;

const OFFICE_EXTENSIONS = new Set(['docx', 'xlsx', 'xls']);
const PRESENTATION_EXTENSIONS = new Set(['pptx', 'potx']);

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'xml',
  'yaml',
  'yml',
  'html',
  'css',
  'js',
  'ts',
  'jsx',
  'tsx',
  'py',
  'rb',
  'java',
  'c',
  'cpp',
  'h',
  'go',
  'rs',
  'sh',
  'sql',
  'log',
]);

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function shouldUseSharedFileDownload(shareId?: string, fileId?: string): boolean {
  return !!shareId && !!fileId;
}

export function shouldUseExtractedTextPreview(deliveryPath?: TFile['llmDeliveryPath']): boolean {
  return deliveryPath === 'text';
}

export function isExtractedTextPreviewLoading(
  status: 'pending' | 'ready' | 'failed' | undefined,
  isInitialLoading: boolean,
  isError: boolean,
): boolean {
  return !isError && (isInitialLoading || status === 'pending');
}

function getPreviewKindByMime(mime?: string): PreviewKind {
  if (!mime) {
    return false;
  }
  if (mime.includes('pdf')) {
    return 'pdf';
  }
  if (mime.includes('officedocument')) {
    // PPTX rendering isn't enabled for this dialog yet — fall through to
    // "Preview unavailable" like any other unsupported type. DOCX/XLSX
    // (wordprocessingml/spreadsheetml) still get the office HTML preview.
    if (mime.includes('presentationml')) {
      return false;
    }
    return 'office';
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('yaml') ||
    mime.includes('csv')
  ) {
    return 'text';
  }
  return false;
}

/**
 * Classifies by extension alone. Returns `undefined` — not `false` — for an
 * extension this function has no opinion on, so {@link getPreviewKind} can
 * tell "unrecognized, ask MIME" apart from "recognized and explicitly
 * unsupported" (PPTX): a mislabeled MIME must not let an excluded extension
 * slip through, the way an unrecognized one is allowed to.
 */
function getPreviewKindByExtension(filename: string): PreviewKind | undefined {
  const extension = getFileExtension(filename);
  if (extension === '') {
    return undefined;
  }
  if (extension === 'pdf') {
    return 'pdf';
  }
  // Generic/missing MIME types (application/octet-stream, application/zip)
  // still have a usable extension — route DOCX/XLSX through the office HTML
  // preview the same as a well-formed MIME would.
  if (OFFICE_EXTENSIONS.has(extension)) {
    return 'office';
  }
  // PPTX rendering isn't enabled for this dialog yet. Recognized explicitly
  // (not left to fall through to MIME) so a presentation mislabeled with a
  // text-like MIME can't bypass the exclusion — same intent as the
  // MIME-based check in getPreviewKindByMime.
  if (PRESENTATION_EXTENSIONS.has(extension)) {
    return false;
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return 'text';
  }
  return undefined;
}

export function getPreviewKind(
  fileName: string,
  fileType?: string,
  fileSource?: string,
): PreviewKind {
  if (fileSource === FileSources.text) {
    return 'text';
  }
  /* Extension wins when recognized: a valid DOCX/XLSX/PDF mislabeled with a
   * generic or incorrect MIME (e.g. `text/plain`) would otherwise be
   * misclassified by MIME first and never reach the extension check,
   * reproducing the garbled-binary-as-text bug this preview exists to fix.
   * MIME is only consulted when the extension is unrecognized — mirrors the
   * server's extension-first routing (`documents/html.ts`'s
   * `officeHtmlBucket`). */
  const byExtension = getPreviewKindByExtension(fileName);
  return byExtension !== undefined ? byExtension : getPreviewKindByMime(fileType);
}
