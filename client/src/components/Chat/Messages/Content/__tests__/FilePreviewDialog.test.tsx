import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import FilePreviewDialog from '../FilePreviewDialog';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_loading: 'Loading...',
      com_ui_preview_unavailable: 'Preview unavailable',
      com_ui_download: 'Download',
      com_ui_copy: 'Copy',
      com_ui_relevance: 'Relevance',
      com_file_pages: 'Pages',
      com_ui_preview: 'Preview',
    };
    return translations[key] || key;
  },
}));

jest.mock('~/components/Artifacts/ArtifactPreview', () => ({
  ArtifactPreview: ({ files }: { files: Record<string, string | undefined> }) => (
    <div data-testid="artifact-preview">{files['index.html']}</div>
  ),
}));

jest.mock('~/data-provider', () => ({
  useFileDownload: jest.fn(() => ({ refetch: jest.fn() })),
  useSharedFileDownload: jest.fn(() => ({ refetch: jest.fn() })),
  useFilePreviewBlob: jest.fn(() => ({ refetch: jest.fn() })),
  useFilePreview: jest.fn(),
  useGetStartupConfig: jest.fn(() => ({ data: undefined })),
  useGetSharedStartupConfig: jest.fn(() => ({ data: undefined })),
}));

const mockedDataProvider = jest.requireMock('~/data-provider') as {
  useFileDownload: jest.Mock;
  useSharedFileDownload: jest.Mock;
  useFilePreviewBlob: jest.Mock;
  useFilePreview: jest.Mock;
  useGetStartupConfig: jest.Mock;
  useGetSharedStartupConfig: jest.Mock;
};
const mockUseFileDownload = mockedDataProvider.useFileDownload;
const mockUseSharedFileDownload = mockedDataProvider.useSharedFileDownload;
const mockUseFilePreviewBlob = mockedDataProvider.useFilePreviewBlob;
const mockUseFilePreview = mockedDataProvider.useFilePreview;
const mockUseGetStartupConfig = mockedDataProvider.useGetStartupConfig;
const mockUseGetSharedStartupConfig = mockedDataProvider.useGetSharedStartupConfig;

const OFFICE_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const renderDialog = (props: Partial<React.ComponentProps<typeof FilePreviewDialog>> = {}) =>
  render(
    <RecoilRoot>
      <FilePreviewDialog
        open
        onOpenChange={jest.fn()}
        fileName="report.docx"
        fileId="file-1"
        fileType={OFFICE_MIME}
        {...props}
      />
    </RecoilRoot>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFileDownload.mockReturnValue({ refetch: jest.fn() });
  mockUseSharedFileDownload.mockReturnValue({ refetch: jest.fn() });
  mockUseFilePreviewBlob.mockReturnValue({ refetch: jest.fn() });
  mockUseGetStartupConfig.mockReturnValue({ data: undefined });
  mockUseGetSharedStartupConfig.mockReturnValue({ data: undefined });
});

describe('FilePreviewDialog office preview', () => {
  it('shows a loading state while the deferred render is pending', () => {
    mockUseFilePreview.mockReturnValue({
      data: { file_id: 'file-1', status: 'pending' },
      isError: false,
    });

    renderDialog();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the extracted HTML via ArtifactPreview once ready', async () => {
    mockUseFilePreview.mockReturnValue({
      data: {
        file_id: 'file-1',
        status: 'ready',
        text: '<p>hello</p>',
        textFormat: 'html',
      },
      isError: false,
    });

    renderDialog();

    // ArtifactPreview is lazy-loaded (keeps the Sandpack bundle out of the
    // main chunk — see FilePreviewDialog.tsx), so it only appears after the
    // dynamic import resolves.
    expect(await screen.findByTestId('artifact-preview')).toHaveTextContent('<p>hello</p>');
  });

  it('shows "Preview unavailable" when the deferred render failed', () => {
    mockUseFilePreview.mockReturnValue({
      data: { file_id: 'file-1', status: 'failed', previewError: 'parser-error' },
      isError: false,
    });

    renderDialog();

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('shows "Preview unavailable" on a query error', () => {
    mockUseFilePreview.mockReturnValue({ data: undefined, isError: true });

    renderDialog();

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('shows "Preview unavailable" for pptx without calling the office preview hook', () => {
    mockUseFilePreview.mockReturnValue({ data: undefined, isError: false });

    renderDialog({
      fileType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileName: 'deck.pptx',
    });

    expect(mockUseFilePreview).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({ enabled: false }),
      undefined,
    );
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-preview')).not.toBeInTheDocument();
  });

  it('does not touch the office preview hook for non-office file types', () => {
    mockUseFilePreview.mockReturnValue({ data: undefined, isError: false });

    renderDialog({ fileType: 'application/pdf', fileName: 'doc.pdf' });

    expect(mockUseFilePreview).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({ enabled: false }),
      undefined,
    );
    expect(screen.queryByTestId('artifact-preview')).not.toBeInTheDocument();
  });

  it('classifies DOCX/XLSX as office via extension when the MIME type is generic', () => {
    mockUseFilePreview.mockReturnValue({ data: undefined, isError: false });

    renderDialog({ fileType: 'application/octet-stream', fileName: 'report.docx' });

    expect(mockUseFilePreview).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({ enabled: true }),
      undefined,
    );
  });

  it('does not classify PPTX as office via extension even with a generic MIME type', () => {
    mockUseFilePreview.mockReturnValue({ data: undefined, isError: false });

    renderDialog({ fileType: 'application/zip', fileName: 'deck.pptx' });

    expect(mockUseFilePreview).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({ enabled: false }),
      undefined,
    );
  });

  it('does not enable the office preview query while the dialog is closed', () => {
    mockUseFilePreview.mockReturnValue({ data: undefined, isError: false });

    renderDialog({ open: false });

    expect(mockUseFilePreview).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({ enabled: false }),
      undefined,
    );
  });

  it('shows only "Preview unavailable" (not also a loading spinner) on a query error', () => {
    mockUseFilePreview.mockReturnValue({ data: undefined, isError: true });

    renderDialog();

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
