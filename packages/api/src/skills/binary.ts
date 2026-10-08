import { isUtf8 } from 'node:buffer';

// Deloitte Custom Change: exported so zip.ts can check binary-ness against the
// same streaming threshold used for skill file downloads.
export const BINARY_CHECK_BYTES = 8192;

const BINARY_THRESHOLD = 0.1;

/**
 * Determine whether a buffer contains binary (non-text) content.
 * Scans the complete bounded buffer so a printable prefix cannot hide
 * opaque bytes later in the submitted content.
 */
export function isBinaryBuffer(buffer: Buffer): boolean {
  const len = buffer.length;
  if (len === 0) {
    return false;
  }
  if (!isUtf8(buffer)) {
    return true;
  }
  let nonPrintable = 0;
  for (let i = 0; i < len; i++) {
    const byte = buffer[i];
    if (byte === 0) {
      return true;
    }
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      nonPrintable++;
    }
  }
  return nonPrintable / len > BINARY_THRESHOLD;
}
