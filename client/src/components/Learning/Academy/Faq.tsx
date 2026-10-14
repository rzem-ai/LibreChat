import { useMemo, useState } from 'react';
import { FilterInput } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import { matchesQuery } from './search';
import { FAQS } from '../content/data';
import { useLocalize } from '~/hooks';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function HighlightedText({ text, query }: { text: string; query: string }): JSX.Element {
  const needle = query.trim();
  if (needle === '') {
    return <>{text}</>;
  }
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, 'gi'));
  let offset = 0;
  return (
    <>
      {parts.map((part) => {
        const key = offset;
        offset += part.length;
        return part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={key} className="bg-yellow-200 text-inherit">
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

export default function Faq(): JSX.Element {
  const localize = useLocalize();
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () => FAQS.filter((faq) => matchesQuery(query, [faq.question, faq.answer])),
    [query],
  );

  return (
    <div className="flex max-w-[80ch] flex-col gap-6">
      <FilterInput
        inputId="learning-faq-search"
        label={localize('com_learning_search_faq')}
        containerClassName="max-w-sm"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {visible.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {localize('com_learning_no_faq', { 0: query })}
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {visible.map((faq) => (
            <li key={faq.question}>
              <p className="text-base font-medium">
                <HighlightedText text={faq.question} query={query} />
              </p>
              <p className="mt-1 text-text-secondary">
                <HighlightedText text={faq.answer} query={query} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
