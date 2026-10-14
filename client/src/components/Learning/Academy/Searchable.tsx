import { SearchInput } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { useLocalize } from '~/hooks';
import { useSearch } from '../hooks';

interface SearchableProps<T> {
  items: T[];
  getFields: (item: T) => string[];
  searchLabel: string;
  renderEmpty: (query: string) => string;
  children: (visible: T[], query: string) => ReactNode;
  className?: string;
}

export default function Searchable<T>({
  items,
  getFields,
  searchLabel,
  renderEmpty,
  children,
  className = '',
}: SearchableProps<T>): JSX.Element {
  const localize = useLocalize();
  const { query, setQuery, visible } = useSearch(items, getFields);

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      <SearchInput
        label={searchLabel}
        clearLabel={localize('com_ui_clear')}
        onClear={() => setQuery('')}
        containerClassName="max-w-sm"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {visible.length === 0 ? (
        <p className="text-sm text-text-secondary">{renderEmpty(query)}</p>
      ) : (
        children(visible, query)
      )}
    </div>
  );
}
