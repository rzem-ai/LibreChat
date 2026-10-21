export type CodeFileFailureStage = 'validation' | 'configuration' | 'download' | 'upload';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getErrorMessage(error: unknown): string {
  const message = asRecord(error).message;
  return typeof message === 'string' ? message : '';
}

function getCodeFileTypeLabel(filename: string): string {
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1];
  return extension ? `${extension.toUpperCase()} file` : 'file';
}

function getUploadTimeoutMessage(fileType: string): string {
  if (fileType === 'XLSX file') {
    return "The XLSX file is too large to upload right now - please try a file under 1MB. We're actively working to increase this limit.";
  }
  return "The file upload timed out. Please try again with a smaller file (under 1MB). We're actively working to increase the size limit.";
}

function formatFileSizeLimit(maxFileSizeBytes: number): string {
  const megabyte = 1024 * 1024;
  if (maxFileSizeBytes % megabyte === 0) {
    return `${maxFileSizeBytes / megabyte} MB`;
  }
  return `${maxFileSizeBytes} bytes`;
}

function getGatewayDownloadFailureReason(error: unknown): string {
  const message = getErrorMessage(error);
  const errorRecord = asRecord(error);
  const response = asRecord(errorRecord.response);
  const messageStatus = message.match(/\bstatus(?: code)?\s+(\d{3})\b/i)?.[1];
  const status = Number(response.status ?? messageStatus);
  const code = typeof errorRecord.code === 'string' ? errorRecord.code : '';

  if (message.includes('codeFile download grant is invalid or expired')) {
    return 'The SharePoint download link has expired or is invalid. Download the file again and retry.';
  }
  if (code === 'ERR_INVALID_URL' || message === 'Invalid URL') {
    return 'The SharePoint download link is invalid. Download the file again and retry.';
  }
  if (message.includes('codeFile download URL domain is not allowed')) {
    return 'The SharePoint download URL is not permitted by the configured domain policy. Contact your administrator.';
  }
  if (
    message.includes('redirect target is private or reserved') ||
    message.includes('requires an IP-literal or explicitly allowed host') ||
    message.includes('SSRF protection:')
  ) {
    return 'The SharePoint download was blocked because its destination failed a security check. Contact your administrator.';
  }
  if (
    message.includes('must use HTTPS') ||
    message.includes('cannot redirect from HTTPS to an insecure protocol')
  ) {
    return 'The SharePoint download was blocked because its link does not use secure HTTPS.';
  }
  if (
    message.includes('redirected without a Location header') ||
    message.includes('Too many redirects')
  ) {
    return 'The SharePoint download link redirected unexpectedly. Download the file again and retry.';
  }
  if (
    message.includes('download timed out following redirects') ||
    ['ETIMEDOUT', 'ECONNABORTED'].includes(code)
  ) {
    return 'The SharePoint download timed out before the file was retrieved. Try again later.';
  }
  if (message.includes('download does not match the gateway-declared size')) {
    return 'The downloaded file size did not match the SharePoint file details. Download the file again and retry.';
  }
  if (message.includes('download exceeds the gateway-declared size')) {
    return 'The downloaded file was larger than the SharePoint file details allowed. Contact your administrator.';
  }
  if (message.includes('codeFile download content type does not match the gateway declaration')) {
    return 'The downloaded file type did not match the SharePoint file details. Download the file again and retry.';
  }
  if (status === 408 || status === 504) {
    return `The SharePoint file download timed out (HTTP ${status}). Try again later.`;
  }
  if (status === 401) {
    return 'SharePoint did not accept the download credentials. Reconnect the SharePoint account and retry.';
  }
  if (status === 403) {
    return 'SharePoint denied permission to this file. Check your file permissions.';
  }
  if (status === 404 || status === 410) {
    return 'The SharePoint file or download link could not be found. Check that the file still exists, then retry.';
  }
  if (status === 429) {
    return 'SharePoint is temporarily rate-limiting file downloads. Try again shortly.';
  }
  if (status >= 500 && status <= 599) {
    return `The SharePoint file-download request failed with a server error (HTTP ${status}). Try again later.`;
  }
  if (status >= 400 && status <= 499) {
    return `SharePoint rejected the file download request (HTTP ${status}). Check the file link and permissions.`;
  }
  if (
    [
      'EAI_AGAIN',
      'ECONNABORTED',
      'ECONNREFUSED',
      'ECONNRESET',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ERR_NETWORK',
    ].includes(code)
  ) {
    return 'A network error prevented the SharePoint file from downloading. Check the connection and retry.';
  }
  return 'The SharePoint file could not be downloaded for an undetermined reason. Try again; if it continues, contact your administrator.';
}

/** Maps attachment failures to safe, actionable guidance for MCP tool results. */
export function getCodeFileAttachmentFailureReason(
  error: unknown,
  filename: string,
  gatewayDownload: boolean,
  failureStage: CodeFileFailureStage,
): string {
  const fileType = getCodeFileTypeLabel(filename);
  const errorRecord = asRecord(error);
  const codeRuntimeFailure = asRecord(errorRecord.codeRuntimeUploadFailure);

  if (
    codeRuntimeFailure.code === 'upload_timeout' &&
    Number.isSafeInteger(codeRuntimeFailure.timeoutSeconds)
  ) {
    return getUploadTimeoutMessage(fileType);
  }
  if (
    codeRuntimeFailure.code === 'upload_size_limit' &&
    Number.isSafeInteger(codeRuntimeFailure.maxFileSizeBytes)
  ) {
    const limit = formatFileSizeLimit(codeRuntimeFailure.maxFileSizeBytes as number);
    return `The ${fileType} is too large to attach to Code Interpreter. Please use a smaller ${fileType} (under ${limit}).`;
  }

  const message = getErrorMessage(error);
  const status = message.match(/\bstatus(?: code)?\s+(\d{3})\b/i)?.[1];

  if (errorRecord.codeRuntimeUploadError === true && status === '504') {
    return getUploadTimeoutMessage(fileType);
  }
  if (message.includes('exceeds the configured Agents file size limit')) {
    return 'The file exceeds the configured size limit for Code Interpreter.';
  }
  if (message.includes('Unsupported codeFile MIME type')) {
    return 'The file type is not supported by Code Interpreter.';
  }
  if (message.includes('file uploads are disabled')) {
    return 'Code Interpreter file uploads are disabled for this agent.';
  }
  if (gatewayDownload && failureStage === 'configuration') {
    return 'The file download settings could not be loaded, so the SharePoint file was not retrieved. Contact your administrator.';
  }
  if (gatewayDownload && failureStage === 'download') {
    return getGatewayDownloadFailureReason(error);
  }
  return 'The file transfer to Code Interpreter failed.';
}
