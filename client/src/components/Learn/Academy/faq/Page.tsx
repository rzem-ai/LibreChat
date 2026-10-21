import { Link } from 'react-router-dom';
import { GEL } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { Faq, FaqLink as FaqLinkType } from '../../content/schema';
import { FAQS } from '../../content/data';
import Searchable from '../Searchable';
import { useLocalize } from '~/hooks';

const linkClass = 'text-text-primary underline';

const getFields = (faq: Faq): string[] => [
  faq.question,
  faq.answer,
  ...(faq.steps ?? []),
  faq.note ?? '',
];

const FaqLink = ({ link }: { link: FaqLinkType }): JSX.Element =>
  link.href.startsWith('/') ? (
    <Link to={link.href} className={linkClass}>
      {link.text}
    </Link>
  ) : (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {link.text}
    </a>
  );

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
                <GEL.HighlightedText text={faq.question} query={query} />
              </p>
              <div className="mt-1 flex flex-col gap-2 text-text-secondary">
                <p>
                  <GEL.HighlightedText text={faq.answer} query={query} />
                </p>
                {faq.steps && (
                  <ol className="list-decimal space-y-1 pl-6">
                    {faq.steps.map((step) => (
                      <li key={step}>
                        <GEL.HighlightedText text={step} query={query} />
                      </li>
                    ))}
                  </ol>
                )}
                {faq.note && (
                  <p>
                    <GEL.HighlightedText text={faq.note} query={query} />
                  </p>
                )}
                {faq.link && <FaqLink link={faq.link} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Searchable>
  );
}
