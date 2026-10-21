import { getCodeFileAttachmentFailureReason } from './codeFileFailure';

describe('getCodeFileAttachmentFailureReason', () => {
  it.each([
    [
      401,
      'SharePoint did not accept the download credentials. Reconnect the SharePoint account and retry.',
    ],
    [403, 'SharePoint denied permission to this file. Check your file permissions.'],
    [
      404,
      'The SharePoint file or download link could not be found. Check that the file still exists, then retry.',
    ],
    [429, 'SharePoint is temporarily rate-limiting file downloads. Try again shortly.'],
    [
      503,
      'The SharePoint file-download request failed with a server error (HTTP 503). Try again later.',
    ],
    [504, 'The SharePoint file download timed out (HTTP 504). Try again later.'],
  ])('maps HTTP %i download responses to a cause-specific message', (status, expected) => {
    const error = Object.assign(new Error(`Request failed with status code ${status}`), {
      response: { status },
    });

    expect(getCodeFileAttachmentFailureReason(error, 'report.pdf', true, 'download')).toBe(
      expected,
    );
  });

  it('identifies expired grants before a download request is made', () => {
    expect(
      getCodeFileAttachmentFailureReason(
        new Error('codeFile download grant is invalid or expired'),
        'report.pdf',
        true,
        'download',
      ),
    ).toBe(
      'The SharePoint download link has expired or is invalid. Download the file again and retry.',
    );
  });

  it('does not expose configuration errors to the tool result', () => {
    expect(
      getCodeFileAttachmentFailureReason(
        new Error('private configuration detail'),
        'report.pdf',
        true,
        'configuration',
      ),
    ).toBe(
      'The file download settings could not be loaded, so the SharePoint file was not retrieved. Contact your administrator.',
    );
  });

  it('uses the upload-specific timeout message when Code Interpreter upload fails', () => {
    expect(
      getCodeFileAttachmentFailureReason(
        Object.assign(new Error('upload failed'), {
          codeRuntimeUploadFailure: { code: 'upload_timeout', timeoutSeconds: 60 },
        }),
        'report.xlsx',
        true,
        'upload',
      ),
    ).toContain('The XLSX file is too large to upload right now');
  });
});
