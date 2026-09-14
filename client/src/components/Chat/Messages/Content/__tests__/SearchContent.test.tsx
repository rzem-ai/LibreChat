import { useContext } from 'react';
import { RecoilRoot } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import { CitationContext } from '~/components/Web/Context';
import SearchContent from '../SearchContent';

/**
 * Regression test for the Share/SearchMessage citation hover-highlight gap: `SearchContent`
 * used to render its parts with no `CitationHighlightProvider`, so `Citation`/`HighlightedText`
 * consumers there silently fell back to `CitationContext`'s no-op default instead of erroring.
 */
function MockPartConsumer() {
  const { hoveredCitationIds, setHoveredCitationIds } = useContext(CitationContext);
  return (
    <div>
      <span data-testid="hovered-ids">
        {hoveredCitationIds ? [...hoveredCitationIds].join(',') : 'none'}
      </span>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <button onClick={() => setHoveredCitationIds(['cite-1'])}>hover</button>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <button onClick={() => setHoveredCitationIds(null)}>unhover</button>
    </div>
  );
}

jest.mock('../Part', () => ({
  __esModule: true,
  default: MockPartConsumer,
}));

jest.mock('../MarkdownLite', () => ({
  __esModule: true,
  default: () => <div data-testid="markdown-lite" />,
}));

const makeTextPart = (text: string): TMessageContentParts =>
  ({ type: ContentTypes.TEXT, text }) as unknown as TMessageContentParts;

describe('SearchContent citation hover-highlight wiring', () => {
  it('mounts a real stateful CitationHighlightProvider (not the no-op default)', () => {
    const message = {
      messageId: 'm1',
      isCreatedByUser: false,
      content: [makeTextPart('hello')],
    } as unknown as TMessage;

    render(
      <RecoilRoot>
        <SearchContent message={message} />
      </RecoilRoot>,
    );

    expect(screen.getByTestId('hovered-ids')).toHaveTextContent('none');

    fireEvent.click(screen.getByRole('button', { name: 'hover' }));
    expect(screen.getByTestId('hovered-ids')).toHaveTextContent('cite-1');

    fireEvent.click(screen.getByRole('button', { name: 'unhover' }));
    expect(screen.getByTestId('hovered-ids')).toHaveTextContent('none');
  });
});
