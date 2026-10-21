import { Providers } from '@librechat/agents';
import { mbToBytes, isOpenAILikeProvider } from 'librechat-data-provider';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// DELOITTE SPECIFIC CHANGE: magic-byte content validation — verifies an uploaded file's real
// signature (via `file-type`) matches its declared MIME type, to catch spoofed/renamed uploads.
export interface FileContentValidationResult {
  isValid: boolean;
  error?: string;
  detectedMime?: string;
}

/** Generic "unknown binary type" MIME — the browser's fallback when it cannot determine a file's type. */
const OCTET_STREAM = 'application/octet-stream';
/** Upper bound on magic-byte detection so a slow/stuck read can never stall the upload request. */
const DETECTION_TIMEOUT_MS = 4000;

// Same real file, different acceptable labels (e.g. a jpeg can legitimately be declared jpg/jpeg/pjpeg).
const compatibleMimePairs: Record<string, ReadonlySet<string>> = {
  'image/jpeg': new Set(['image/jpg', 'image/jpeg', 'image/pjpeg']),
  'image/jpg': new Set(['image/jpg', 'image/jpeg', 'image/pjpeg']),
  'image/pjpeg': new Set(['image/jpg', 'image/jpeg', 'image/pjpeg']),
  'audio/mpeg': new Set(['audio/mpeg', 'audio/mp3']),
  'audio/mp3': new Set(['audio/mpeg', 'audio/mp3']),
  'video/quicktime': new Set(['video/quicktime', 'video/mov']),
  'application/zip': new Set([
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/epub+zip',
    'application/java-archive',
  ]),
};

const isCompatibleMime = (detected: string, declared: string): boolean => {
  if (detected === declared) return true;
  if (declared === OCTET_STREAM) return true;
  return (
    compatibleMimePairs[detected]?.has(declared) === true ||
    compatibleMimePairs[declared]?.has(detected) === true
  );
};

/**
 * Pure policy: given the already-detected MIME (or undefined, meaning `file-type`
 * found no recognizable signature — e.g. plain text/code), decide whether the
 * declared MIME is compatible. Kept side-effect free so it is trivially
 * unit-testable without loading the ESM-only `file-type` module.
 */
export function evaluateContent(
  detectedMime: string | undefined,
  declaredMime: string,
): FileContentValidationResult {
  // Nothing was claimed, so there's nothing to contradict.
  if (!declaredMime || declaredMime === OCTET_STREAM) {
    return { isValid: true };
  }
  // No magic bytes found at all (true of plain text/code) — nothing to compare against.
  if (!detectedMime) {
    return { isValid: true };
  }
  if (isCompatibleMime(detectedMime, declaredMime)) {
    return { isValid: true, detectedMime };
  }
  // Real content contradicts the declared type — reject.
  return {
    isValid: false,
    detectedMime,
    error: `File content (${detectedMime}) does not match declared type (${declaredMime}).`,
  };
}

type FileTypeModule = typeof import('file-type');
// `new Function` hides the dynamic import from babel/jest CJS transforms that would
// otherwise rewrite it to `require()` and fail against the ESM-only `file-type` package.
const importFileType = new Function('return import("file-type")') as () => Promise<FileTypeModule>;

/** Deloitte Custom Change: Exported for testing the timeout behavior in isolation from the `file-type` module. */
export const withTimeoutOrUndefined = <T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | undefined> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });

/**
 * Magic-byte validation for uploads. Rejects clear mismatches; passes ambiguous
 * cases (including detection timing out) so unknown-but-legitimate formats and
 * transient read failures aren't blocked.
 */
export async function validateFileContent(
  filePath: string,
  declaredMime: string,
): Promise<FileContentValidationResult> {
  if (!declaredMime || declaredMime === OCTET_STREAM) {
    return { isValid: true };
  }

  // The actual check: read the file's real magic bytes, bounded by a timeout so it can't hang.
  const detected = await withTimeoutOrUndefined(
    importFileType().then(({ fileTypeFromFile }) => fileTypeFromFile(filePath)),
    DETECTION_TIMEOUT_MS,
  );
  return evaluateContent(detected?.mime, declaredMime);
}

export interface PDFValidationResult {
  isValid: boolean;
  error?: string;
}

export interface VideoValidationResult {
  isValid: boolean;
  error?: string;
}

export interface AudioValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
}

export async function validatePdf(
  pdfBuffer: Buffer,
  fileSize: number,
  provider: Providers,
  configuredFileSizeLimit?: number,
  model?: string,
): Promise<PDFValidationResult> {
  if (provider === Providers.ANTHROPIC) {
    return validateAnthropicPdf(pdfBuffer, fileSize, configuredFileSizeLimit);
  }

  if (provider === Providers.BEDROCK) {
    return validateBedrockDocument(
      fileSize,
      'application/pdf',
      pdfBuffer,
      configuredFileSizeLimit,
      model,
    );
  }

  if (isOpenAILikeProvider(provider)) {
    return validateOpenAIPdf(fileSize, configuredFileSizeLimit);
  }

  if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
    return validateGooglePdf(fileSize, configuredFileSizeLimit);
  }

  return { isValid: true };
}

/**
 * Validates if a PDF meets Anthropic's requirements
 * @param pdfBuffer - The PDF file as a buffer
 * @param fileSize - The file size in bytes
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
async function validateAnthropicPdf(
  pdfBuffer: Buffer,
  fileSize: number,
  configuredFileSizeLimit?: number,
): Promise<PDFValidationResult> {
  try {
    const providerLimit = mbToBytes(32);
    const effectiveLimit = configuredFileSizeLimit ?? providerLimit;

    if (fileSize > effectiveLimit) {
      const limitMB = Math.round(effectiveLimit / (1024 * 1024));
      return {
        isValid: false,
        error: `PDF file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
      };
    }

    if (!pdfBuffer || pdfBuffer.length < 5) {
      return {
        isValid: false,
        error: 'Invalid PDF file: too small or corrupted',
      };
    }

    const pdfHeader = pdfBuffer.subarray(0, 5).toString();
    if (!pdfHeader.startsWith('%PDF-')) {
      return {
        isValid: false,
        error: 'Invalid PDF file: missing PDF header',
      };
    }

    const pdfContent = pdfBuffer.toString('binary');
    if (
      pdfContent.includes('/Encrypt ') ||
      pdfContent.includes('/U (') ||
      pdfContent.includes('/O (')
    ) {
      return {
        isValid: false,
        error: 'PDF is password-protected or encrypted. Anthropic requires unencrypted PDFs.',
      };
    }

    const pageMatches = pdfContent.match(/\/Type[\s]*\/Page[^s]/g);
    const estimatedPages = pageMatches ? pageMatches.length : 1;

    if (estimatedPages > 100) {
      return {
        isValid: false,
        error: `PDF has approximately ${estimatedPages} pages, exceeding Anthropic's 100-page limit`,
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error('PDF validation error:', error);
    return {
      isValid: false,
      error: 'Failed to validate PDF file',
    };
  }
}

/**
 * Matches Bedrock Claude 4+ model identifiers in every form they occur:
 * prefixed (`anthropic.claude-*`, `us.anthropic.claude-*`,
 * `global.anthropic.claude-*`), bare (`claude-*`, used when the LibreChat model
 * ID maps to an application inference profile), and either segment order
 * (`claude-opus-5`, `claude-4-6-opus`).
 *
 * Two forms were previously dropped, each defaulting the model back to the
 * 4.5 MB limit: requiring a `-` after the major version excluded undated IDs
 * like `claude-opus-5`, and requiring a literal `anthropic.` excluded bare
 * inference-profile IDs. Fable/Mythos are Claude 4+ generation and take the
 * same PDF exemption.
 *
 * Mirrors `BEDROCK_CLAUDE_4PLUS_THINKING` in `librechat-data-provider`, which
 * matches on the family token for the same reason. Only reached for the Bedrock
 * provider, so the loose prefix cannot leak into other endpoints.
 */
const CLAUDE_FAMILY = 'sonnet|opus|haiku|fable|mythos';
const BEDROCK_CLAUDE_4_PLUS_RE = new RegExp(
  `(?:^|\\.)(?:anthropic\\.)?claude-(?:(?:${CLAUDE_FAMILY})-[4-9]\\d*|[4-9]\\d*(?:[-.]\\d+)?-(?:${CLAUDE_FAMILY}))(?:[-.]|$)`,
);
const isBedrockClaude4Plus = (model?: string): boolean =>
  model != null && BEDROCK_CLAUDE_4_PLUS_RE.test(model);

/**
 * Matches Bedrock Nova model identifiers, including cross-region inference profile IDs.
 * e.g. "amazon.nova-pro-v1:0" or "us.amazon.nova-pro-v1:0"
 */
const isBedrockNova = (model?: string): boolean =>
  model != null && /(?:^|\.)amazon\.nova-/.test(model);

const pdfMimeType = 'application/pdf';
const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Returns true when the given model + MIME type combination is exempt from
 * Bedrock's default 4.5 MB per-document limit.
 *
 * Per AWS docs (https://docs.aws.amazon.com/bedrock/latest/userguide/inference-api-restrictions.html):
 * - Claude 4+: PDFs are exempt from the 4.5 MB limit
 * - Nova: PDFs and DOCX are exempt from the 4.5 MB limit
 */
const isExemptFromBedrockDocLimit = (model?: string, mimeType?: string): boolean => {
  if (mimeType === pdfMimeType) {
    return isBedrockClaude4Plus(model) || isBedrockNova(model);
  }
  if (mimeType === docxMimeType) {
    return isBedrockNova(model);
  }
  return false;
};

/**
 * Validates a document against Bedrock size limits. The default limit is 4.5 MB,
 * but Claude 4+ (PDF) and Nova (PDF/DOCX) models are exempt per AWS docs.
 * When exempt, falls back to a 32 MB request-level limit as a reasonable upper bound.
 * @param fileSize - The file size in bytes
 * @param mimeType - The MIME type of the document
 * @param fileBuffer - The file buffer (used for PDF header validation)
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @param model - Optional Bedrock model identifier for model-specific limit exceptions
 * @returns Promise that resolves to validation result
 */
export async function validateBedrockDocument(
  fileSize: number,
  mimeType: string,
  fileBuffer?: Buffer,
  configuredFileSizeLimit?: number,
  model?: string,
): Promise<ValidationResult> {
  try {
    const exempt = isExemptFromBedrockDocLimit(model, mimeType);
    /** Default 4.5 MB; exempt models (Claude 4+ PDF, Nova PDF/DOCX) default to 32 MB when unconfigured */
    const providerLimit = exempt ? mbToBytes(32) : mbToBytes(4.5);
    const effectiveLimit = configuredFileSizeLimit ?? providerLimit;

    if (fileSize > effectiveLimit) {
      const limitMB = (effectiveLimit / (1024 * 1024)).toFixed(1);
      return {
        isValid: false,
        error: `File size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds the ${limitMB}MB limit for Bedrock`,
      };
    }

    if (mimeType === pdfMimeType && fileBuffer) {
      if (fileBuffer.length < 5) {
        return {
          isValid: false,
          error: 'Invalid PDF file: too small or corrupted',
        };
      }

      const pdfHeader = fileBuffer.subarray(0, 5).toString();
      if (!pdfHeader.startsWith('%PDF-')) {
        return {
          isValid: false,
          error: 'Invalid PDF file: missing PDF header',
        };
      }
    }

    return { isValid: true };
  } catch (error) {
    console.error('Bedrock document validation error:', error);
    return {
      isValid: false,
      error: 'Failed to validate document file',
    };
  }
}

/**
 * Validates if a PDF meets OpenAI's requirements
 * @param fileSize - The file size in bytes
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
async function validateOpenAIPdf(
  fileSize: number,
  configuredFileSizeLimit?: number,
): Promise<PDFValidationResult> {
  const providerLimit = mbToBytes(10);
  const effectiveLimit = configuredFileSizeLimit ?? providerLimit;

  if (fileSize > effectiveLimit) {
    const limitMB = Math.round(effectiveLimit / (1024 * 1024));
    return {
      isValid: false,
      error: `PDF file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
    };
  }

  return { isValid: true };
}

/**
 * Validates if a PDF meets Google's requirements
 * @param fileSize - The file size in bytes
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
async function validateGooglePdf(
  fileSize: number,
  configuredFileSizeLimit?: number,
): Promise<PDFValidationResult> {
  const providerLimit = mbToBytes(20);
  const effectiveLimit = configuredFileSizeLimit ?? providerLimit;

  if (fileSize > effectiveLimit) {
    const limitMB = Math.round(effectiveLimit / (1024 * 1024));
    return {
      isValid: false,
      error: `PDF file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
    };
  }

  return { isValid: true };
}

/**
 * Validates video files for different providers
 * @param videoBuffer - The video file as a buffer
 * @param fileSize - The file size in bytes
 * @param provider - The provider to validate for
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
export async function validateVideo(
  videoBuffer: Buffer,
  fileSize: number,
  provider: Providers,
  configuredFileSizeLimit?: number,
): Promise<VideoValidationResult> {
  if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
    const providerLimit = mbToBytes(20);
    const effectiveLimit = configuredFileSizeLimit ?? providerLimit;

    if (fileSize > effectiveLimit) {
      const limitMB = Math.round(effectiveLimit / (1024 * 1024));
      return {
        isValid: false,
        error: `Video file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
      };
    }
  }

  if (!videoBuffer || videoBuffer.length < 10) {
    return {
      isValid: false,
      error: 'Invalid video file: too small or corrupted',
    };
  }

  return { isValid: true };
}

/**
 * Validates audio files for different providers
 * @param audioBuffer - The audio file as a buffer
 * @param fileSize - The file size in bytes
 * @param provider - The provider to validate for
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
export async function validateAudio(
  audioBuffer: Buffer,
  fileSize: number,
  provider: Providers,
  configuredFileSizeLimit?: number,
): Promise<AudioValidationResult> {
  if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
    const providerLimit = mbToBytes(20);
    const effectiveLimit = configuredFileSizeLimit ?? providerLimit;

    if (fileSize > effectiveLimit) {
      const limitMB = Math.round(effectiveLimit / (1024 * 1024));
      return {
        isValid: false,
        error: `Audio file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
      };
    }
  }

  if (!audioBuffer || audioBuffer.length < 10) {
    return {
      isValid: false,
      error: 'Invalid audio file: too small or corrupted',
    };
  }

  return { isValid: true };
}

/**
 * Validates image files for different providers
 * @param imageBuffer - The image file as a buffer
 * @param fileSize - The file size in bytes
 * @param provider - The provider to validate for
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
export async function validateImage(
  imageBuffer: Buffer,
  fileSize: number,
  provider: Providers | string,
  configuredFileSizeLimit?: number,
): Promise<ImageValidationResult> {
  if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
    const providerLimit = mbToBytes(20);
    const effectiveLimit = configuredFileSizeLimit ?? providerLimit;

    if (fileSize > effectiveLimit) {
      const limitMB = Math.round(effectiveLimit / (1024 * 1024));
      return {
        isValid: false,
        error: `Image file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
      };
    }
  }

  if (provider === Providers.ANTHROPIC) {
    const providerLimit = mbToBytes(5);
    const effectiveLimit = configuredFileSizeLimit ?? providerLimit;

    if (fileSize > effectiveLimit) {
      const limitMB = Math.round(effectiveLimit / (1024 * 1024));
      return {
        isValid: false,
        error: `Image file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
      };
    }
  }

  if (!imageBuffer || imageBuffer.length < 10) {
    return {
      isValid: false,
      error: 'Invalid image file: too small or corrupted',
    };
  }

  return { isValid: true };
}
