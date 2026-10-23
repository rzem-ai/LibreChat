// Deloitte Custom Change: joins a localized principal list for people picker copy.
/** Joins items as `a`, `a and b`, or `a, b and c` using the given (localized) conjunction. */
export const joinList = (items: string[], conjunction: string): string => {
  if (items.length < 2) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
};
