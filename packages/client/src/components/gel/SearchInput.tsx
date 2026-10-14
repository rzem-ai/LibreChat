import type { InputHTMLAttributes } from 'react';
import type { JSX } from 'react/jsx-runtime';
import { IconButton } from '../IconButton';
import { Icon } from './icons';
import { cn } from '~/utils';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Accessible name; the field shows no visible label. */
  label: string;
  /** Already-localized name for the clear button. */
  clearLabel: string;
  /** Empties the query. The clear button only renders while there is a value. */
  onClear: () => void;
  containerClassName?: string;
}

export function SearchInput({
  label,
  clearLabel,
  onClear,
  containerClassName,
  className,
  value,
  ...props
}: SearchInputProps): JSX.Element {
  const SearchIcon = Icon.Search;
  const ClearIcon = Icon.Clear;
  const hasValue = typeof value === 'string' && value.length > 0;

  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 rounded-lg border border-border-light bg-transparent pl-3 pr-1 text-text-secondary focus-within:border-border-heavy',
        containerClassName,
      )}
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        value={value}
        className={cn(
          'h-full w-full min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none',
          className,
        )}
        {...props}
      />
      {hasValue && (
        <IconButton label={clearLabel} size="xs" shape="round" onClick={onClear}>
          <ClearIcon className="size-3.5" aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}
