import React from 'react';
import '@testing-library/jest-dom';
import { FileSources } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import SourceIcon from '../SourceIcon';

// Deloitte Custom Change: # Visible icons for file uploads- PR #402
jest.mock('~/components/Endpoints', () => ({
  MinimalIcon: () => <span data-testid="minimal-icon" />,
}));

describe('SourceIcon', () => {
  test('renders the code-interpreter icon when isCodeFile is true', () => {
    const { container } = render(<SourceIcon isCodeFile />);

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('bg-black');
  });

  // Deloitte Custom Change: adopted @librechat/client's semantic color tokens
  // (bg-series-*) in place of literal Tailwind colors
  test('renders the file-search icon when isFileSearch is true', () => {
    const { container } = render(<SourceIcon isFileSearch />);

    expect(container.firstElementChild).toHaveClass('bg-series-4', 'text-text-on-status');
  });

  test('renders the file-search icon when source is vectordb, even without isFileSearch', () => {
    const { container } = render(<SourceIcon source={FileSources.vectordb} />);

    expect(container.firstElementChild).toHaveClass('bg-series-4', 'text-text-on-status');
  });

  test('prioritizes isCodeFile over isFileSearch', () => {
    const { container } = render(<SourceIcon isCodeFile isFileSearch />);

    expect(container.firstElementChild).toHaveClass('bg-black');
  });

  test('renders the text-source icon when source is text', () => {
    const { container } = render(<SourceIcon source={FileSources.text} />);

    expect(container.firstElementChild).toHaveClass('bg-series-1', 'text-text-on-status');
  });

  test('renders an endpoint icon for a known endpoint source', () => {
    render(<SourceIcon source={FileSources.openai} />);

    expect(screen.getByTestId('minimal-icon')).toBeInTheDocument();
  });

  test('renders nothing for an unmapped source', () => {
    const { container } = render(<SourceIcon source={FileSources.local} />);

    expect(container).toBeEmptyDOMElement();
  });

  test('forwards arbitrary HTML/ARIA attributes to the root element', () => {
    render(<SourceIcon isCodeFile aria-label="Source: execute_code" />);

    expect(screen.getByLabelText('Source: execute_code')).toBeInTheDocument();
  });
});
