import { GEL } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { Faq } from '../../content/schema';
import { ArticleLink } from '../articles/mdx/link';
import { READING_COLUMN } from '../column';
import { FAQS } from '../../content/data';
import Searchable from '../Searchable';
import { useLocalize } from '~/hooks';

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

const stripLinks = (text: string): string => text.replace(LINK_PATTERN, '$1');

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
            <ArticleLink key={i} href={parts[i + 1]}>
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
    <div className={`${READING_COLUMN} flex flex-col gap-6`}>
      <h2 className="text-2xl font-medium">{localize('com_learning_tab_faq')}</h2>
      <Searchable
        showSearch={FAQ_SEARCH}
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
                  <GEL.HighlightedText text={faq.question} query={query} />
                </p>
                <p className="mt-1 text-text-secondary">
                  <RichText text={faq.answer} query={query} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Searchable>
    </div>
  );
}
