export function matchesQuery(query: string, fields: string[]): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || fields.some((field) => field.toLowerCase().includes(needle));
}
