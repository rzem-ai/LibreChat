import { useContext } from 'react';
import { RecoilRoot } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import { CitationContext } from '~/components/Web/Context';
import MultiMessage from '../MultiMessage';

/**
 * Regression test for the legacy `Message`/`MessageRender` row: it used to render outside any
 * `CitationHighlightProvider`, so `Citation`/`HighlightedText` consumers there silently fell back
 * to `CitationContext`'s no-op default instead of erroring. `MultiMessage` now mounts a single
 * `CitationHighlightProvider` around every row variant.
 */
function MockCitationConsumerRow({ message }: { message: TMessage }) {
  const { hoveredCitationIds, setHoveredCitationIds } = useContext(CitationContext);
  return (
    <div>
      <div data-testid="row">{message.messageId}</div>
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

jest.mock('../Message', () => ({ __esModule: true, default: MockCitationConsumerRow }));

describe('MultiMessage citation hover-highlight wiring', () => {
  it('covers the legacy Message row (no `content` field) with a real stateful provider', () => {
    const message = {
      messageId: 'm1',
      parentMessageId: 'parent-1',
      conversationId: 'c1',
      isCreatedByUser: false,
      text: 'hello',
      children: [],
    } as unknown as TMessage;

    render(
      <RecoilRoot>
        <MultiMessage
          messageId="parent-1"
          messagesTree={[message]}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>,
    );

    expect(screen.getByTestId('hovered-ids')).toHaveTextContent('none');

    fireEvent.click(screen.getByRole('button', { name: 'hover' }));
    expect(screen.getByTestId('hovered-ids')).toHaveTextContent('cite-1');

    fireEvent.click(screen.getByRole('button', { name: 'unhover' }));
    expect(screen.getByTestId('hovered-ids')).toHaveTextContent('none');
  });
});
