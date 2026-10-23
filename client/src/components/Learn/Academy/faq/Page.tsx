import { GEL } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { Faq } from '../../content/schema';
import { ArticleLink } from '../articles/mdx/link';
import { FAQS } from '../../content/data';
import Searchable from '../Searchable';
import { useLocalize } from '~/hooks';

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

const stripLinks = (text: string): string => text.replace(LINK_PATTERN, '$1');

const SORTED_FAQS: Faq[] = [...FAQS].sort((a, b) =>
  a.question.localeCompare(b.question, 'en', { sensitivity: 'base' }),
);

const getFields = (faq: Faq): string[] => [faq.question, stripLinks(faq.answer)];

const RichText = ({ text, query }: { text: string; query: string }): JSX.Element => {
  const parts = text.split(LINK_PATTERN);
  return (
    <>
      {parts.map((part, i) => {
        const slot = i % 3;
        if (slot === 2) {
          return null;
        }
        if (slot === 1) {
          return (
            <ArticleLink key={i} href={parts[i + 1]} className="font-normal">
              {part}
            </ArticleLink>
          );
        }
        return <GEL.HighlightedText key={i} text={part} query={query} />;
      })}
    </>
  );
};

/** Only a handful of questions today; set to true once the list is long enough to need searching. */
const FAQ_SEARCH = false;

export default function Faq(): JSX.Element {
  const localize = useLocalize();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-medium">{localize('com_learning_tab_faq')}</h2>
      <Searchable
        showSearch={FAQ_SEARCH}
        items={SORTED_FAQS}
        getFields={getFields}
        searchLabel={localize('com_learning_search_faq')}
        renderEmpty={(query) => localize('com_learning_no_faq', { 0: query })}
      >
        {(visible, query) => (
          <ul className="border-b border-border-light">
            {visible.map((faq) => (
              <li
                key={faq.question}
                className="grid gap-2 border-t border-border-light py-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-12"
              >
                <p className="text-lg font-medium">
                  <GEL.HighlightedText text={faq.question} query={query} />
                </p>
                <div className="flex max-w-prose flex-col gap-3 text-pretty text-text-secondary">
                  {faq.answer.split('\n\n').map((paragraph) => (
                    <p key={paragraph}>
                      <RichText text={paragraph} query={query} />
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Searchable>
    </div>
  );
}
