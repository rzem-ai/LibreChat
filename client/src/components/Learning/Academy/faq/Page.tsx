import { HighlightedText } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { Faq } from '../../content/schema';
import { FAQS } from '../../content/data';
import Searchable from '../Searchable';
import { useLocalize } from '~/hooks';

const getFields = (faq: Faq): string[] => [faq.question, faq.answer];

export default function Faq(): JSX.Element {
  const localize = useLocalize();

  return (
    <Searchable
      className="max-w-[80ch]"
      items={FAQS}
      getFields={getFields}
      searchLabel={localize('com_learning_search_faq')}
      renderEmpty={(query) => localize('com_learning_no_faq', { 0: query })}
    >
      {(visible, query) => (
        <ul className="flex flex-col gap-6">
          {visible.map((faq) => (
            <li key={faq.question}>
              <p className="text-base font-semibold">
                <HighlightedText text={faq.question} query={query} />
              </p>
              <p className="mt-1 text-text-secondary">
                <HighlightedText text={faq.answer} query={query} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Searchable>
  );
}
