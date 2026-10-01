const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/;
const EXPLICIT_OFFSET_PATTERN = /([+-])(\d{2}):?(\d{2})\s*$/;

function formatDate(date: Date): string {
  const [day, month, year] = date
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    .split(' ');
  return `${day} ${month.slice(0, 3)} ${year}`;
}

/** Formats a parseable date value as "06 Nov 2025", preserving its written calendar date. */
export function formatDisplayDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  const isoDate = value.match(ISO_DATE_PATTERN);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return undefined;
    }
    return formatDate(date);
  }

  const offset = value.match(EXPLICIT_OFFSET_PATTERN);
  if (offset) {
    const [, sign, hours, minutes] = offset;
    const offsetMinutes = Number(hours) * 60 + Number(minutes);
    if (Number(hours) > 23 || Number(minutes) > 59) {
      return undefined;
    }
    const sourceDate = new Date(
      parsed.getTime() + (sign === '+' ? offsetMinutes : -offsetMinutes) * 60_000,
    );
    return formatDate(sourceDate);
  }

  return formatDate(parsed);
}
