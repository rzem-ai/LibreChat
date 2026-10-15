import { useMemo, useState } from 'react';

export function matchesQuery(query: string, fields: string[]): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || fields.some((field) => field.toLowerCase().includes(needle));
}

export default function useSearch<T>(items: T[], getFields: (item: T) => string[]) {
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () => items.filter((item) => matchesQuery(query, getFields(item))),
    [items, getFields, query],
  );
  return { query, setQuery, visible };
}
