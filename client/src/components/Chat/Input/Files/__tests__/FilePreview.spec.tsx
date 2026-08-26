import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FileSources } from 'librechat-data-provider';
import type { CodeEnvRef } from 'librechat-data-provider';
import FilePreview from '../FilePreview';

// Deloitte Custom Change: # Visible icons for file uploads- PR #402
jest.mock('@librechat/client', () => ({
  Spinner: () => <span data-testid="spinner" />,
  FileIcon: () => <span data-testid="file-icon" />,
}));

jest.mock('../SourceIcon', () => {
  return function MockSourceIcon({
    source,
    isCodeFile,
    isFileSearch,
  }: {
    source?: string;
    isCodeFile?: boolean;
    isFileSearch?: boolean;
  }) {
    return (
      <span
        data-testid="source-icon"
        data-source={source}
        data-is-code-file={String(isCodeFile)}
        data-is-file-search={String(isFileSearch)}
      />
    );
  };
});

const fileType = { paths: (() => null) as unknown as React.FC, fill: '', title: 'file' };

describe('FilePreview', () => {
  test('marks isCodeFile when metadata.fileIdentifier is set', () => {
    render(
      <FilePreview
        file={{ source: FileSources.execute_code, metadata: { fileIdentifier: 'abc' } }}
        fileType={fileType}
      />,
    );

    expect(screen.getByTestId('source-icon')).toHaveAttribute('data-is-code-file', 'true');
  });

  test('marks isCodeFile when metadata.codeEnvRef is set', () => {
    const codeEnvRef: CodeEnvRef = {
      kind: 'user',
      id: 'user-1',
      storage_session_id: 'session-1',
      file_id: 'file-1',
    };

    render(
      <FilePreview
        file={{ source: FileSources.execute_code, metadata: { codeEnvRef } }}
        fileType={fileType}
      />,
    );

    expect(screen.getByTestId('source-icon')).toHaveAttribute('data-is-code-file', 'true');
  });

  test('does not mark isCodeFile when no code metadata is present', () => {
    render(<FilePreview file={{ source: FileSources.local }} fileType={fileType} />);

    expect(screen.getByTestId('source-icon')).toHaveAttribute('data-is-code-file', 'false');
  });

  test('marks isFileSearch when the file is embedded', () => {
    render(
      <FilePreview file={{ source: FileSources.vectordb, embedded: true }} fileType={fileType} />,
    );

    expect(screen.getByTestId('source-icon')).toHaveAttribute('data-is-file-search', 'true');
  });

  test('does not mark isFileSearch when the file is not embedded', () => {
    render(
      <FilePreview file={{ source: FileSources.local, embedded: false }} fileType={fileType} />,
    );

    expect(screen.getByTestId('source-icon')).toHaveAttribute('data-is-file-search', 'false');
  });

  test('forwards the file source to SourceIcon', () => {
    render(<FilePreview file={{ source: FileSources.openai }} fileType={fileType} />);

    expect(screen.getByTestId('source-icon')).toHaveAttribute('data-source', FileSources.openai);
  });
});
