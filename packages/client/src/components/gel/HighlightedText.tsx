import type { JSX } from 'react/jsx-runtime';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wraps case-insensitive matches of `query` in a highlight mark. */
export function HighlightedText({ text, query }: { text: string; query: string }): JSX.Element {
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
          <mark key={key} className="bg-highlight text-text-fixed">
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}
