// Deloitte Custom Change: presentational key/value fields extracted from MemoryCreateDialog
// so the Settings tab's inline create row can reuse the same markup.
import { Label, Input, Textarea, FieldMessage } from '@librechat/client';
import type { TranslationKeys } from '~/hooks/useLocalize';
import MemorySensitiveDataNotice from './MemorySensitiveDataNotice';
import { useLocalize } from '~/hooks';

interface MemoryCreateFieldsProps {
  memoryKey: string;
  onKeyChange: (value: string) => void;
  onKeyBlur: () => void;
  keyError: TranslationKeys | null;
  value: string;
  onValueChange: (value: string) => void;
  onValueBlur: () => void;
  valueError: TranslationKeys | null;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export default function MemoryCreateFields({
  memoryKey,
  onKeyChange,
  onKeyBlur,
  keyError,
  value,
  onValueChange,
  onValueBlur,
  valueError,
  onKeyDown,
}: MemoryCreateFieldsProps) {
  const localize = useLocalize();

  return (
    <div className="space-y-4">
      <MemorySensitiveDataNotice />
      <div className="space-y-2">
        <Label htmlFor="memory-key" className="text-sm font-medium text-text-primary">
          {localize('com_ui_key')}
        </Label>
        <Input
          id="memory-key"
          value={memoryKey}
          onChange={(e) => onKeyChange(e.target.value)}
          onBlur={onKeyBlur}
          onKeyDown={onKeyDown}
          placeholder={localize('com_ui_enter_key')}
          className="w-full"
          aria-invalid={keyError != null}
          aria-describedby="memory-key-message"
        />
        <FieldMessage
          id="memory-key-message"
          message={keyError ? localize(keyError) : null}
          hint={localize('com_ui_memory_key_hint')}
          lines={2}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="memory-value" className="text-sm font-medium text-text-primary">
          {localize('com_ui_value')}
        </Label>
        <Textarea
          id="memory-value"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onBlur={onValueBlur}
          onKeyDown={onKeyDown}
          placeholder={localize('com_ui_enter_value')}
          className="min-h-[100px] w-full resize-none rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
          rows={4}
          aria-invalid={valueError != null}
          aria-describedby="memory-value-message"
        />
        <FieldMessage
          id="memory-value-message"
          message={valueError ? localize(valueError) : null}
        />
      </div>
    </div>
  );
}
