import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input } from '@librechat/client';
import type { FormEvent, ReactElement } from 'react';
import { useLocalize } from '../../hooks/localize';

/** Inline single-field form for naming a folder; Escape or Cancel closes it. */
export default function FolderForm({
  label,
  initial,
  suggestions,
  onSubmit,
  onCancel,
}: {
  label: string;
  initial: string;
  suggestions?: string[];
  onSubmit: (value: string) => void;
  onCancel: () => void;
}): ReactElement {
  const localize = useLocalize();
  const inputId = useId();
  const listId = useId();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  /** The form opens from a button press, so focus moves to the field it asked for. */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value);
  };

  return (
    <form className="mt-2 flex flex-col gap-2" onSubmit={submit}>
      <label htmlFor={inputId} className="text-xs text-text-secondary">
        {label}
      </label>
      <Input
        id={inputId}
        ref={inputRef}
        value={value}
        maxLength={400}
        list={suggestions?.length ? listId : undefined}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {localize('com_ui_cancel')}
        </Button>
        <Button type="submit" size="sm" variant="outline">
          {localize('com_ui_save')}
        </Button>
      </div>
    </form>
  );
}
