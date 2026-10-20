import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TooltipContent } from '~/components/Web/SourceHovercard';

// Deloitte Custom Change: cover wrapping for every citation title interaction variant.
jest.mock('~/hooks', () => ({
  useLocalize: () => jest.fn(),
}));

describe('TooltipContent', () => {
  it('wraps long underscore-delimited titles for linked, file, and plain citations', () => {
    const title = 'a_very_long_citation_title_without_any_spaces';
    render(
      <>
        <TooltipContent icon={null} title={title} href="https://example.com/source" />
        <TooltipContent icon={null} title={title} onClick={jest.fn()} />
        <TooltipContent icon={null} title={title} />
      </>,
    );

    for (const titleElement of screen.getAllByText(title)) {
      expect(titleElement).toHaveClass('[overflow-wrap:anywhere]');
    }
  });
});
