import { Link } from 'react-router-dom';
import { GEL } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { Faq } from '../../content/schema';
import { FAQS } from '../../content/data';
import Searchable from '../Searchable';
import { useLocalize } from '~/hooks';

const linkClass = 'font-normal underline';
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

const stripLinks = (text: string): string => text.replace(LINK_PATTERN, '$1');

const getFields = (faq: Faq): string[] => [faq.question, stripLinks(faq.answer)];

const FaqLink = ({ text, href }: { text: string; href: string }): JSX.Element =>
  href.startsWith('/') ? (
    <Link to={href} className={linkClass}>
      {text}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {text}
    </a>
  );

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
          return <FaqLink key={i} text={part} href={parts[i + 1]} />;
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
    <Searchable
      className="mx-auto w-full max-w-[80ch]"
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
  );
}
