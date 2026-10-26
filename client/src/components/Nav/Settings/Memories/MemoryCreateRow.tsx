// Deloitte Custom Change: inline (non-modal) create row for the Settings tab's Memories
// list, reusing the shared create-form hook/fields also used by the sidebar panel's dialog.
import { Plus } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import useMemoryCreateForm from '~/components/SidePanel/Memories/useMemoryCreateForm';
import MemoryCreateFields from '~/components/SidePanel/Memories/MemoryCreateFields';
import { useLocalize } from '~/hooks';

interface MemoryCreateRowProps {
  isCreating: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * Deloitte Custom Change: shared icon+label content for the "Add a memory" trigger,
 * reused by this row's own trigger button below and by the empty-state CTA in
 * Memories/index.tsx — the two buttons differ in chrome but not in what they say.
 */
export function AddMemoryLabel() {
  const localize = useLocalize();
  return (
    <>
      <Plus className="size-4" aria-hidden="true" />
      {localize('com_ui_add_a_memory')}
    </>
  );
}

export default function MemoryCreateRow({ isCreating, onOpen, onClose }: MemoryCreateRowProps) {
  const localize = useLocalize();
  const {
    key,
    setKey,
    value,
    setValue,
    reset,
    touchField,
    keyError,
    valueError,
    handleSave,
    handleKeyPress,
    isLoading,
    hasErrors,
  } = useMemoryCreateForm({ onSuccess: onClose });

  const handleCancel = () => {
    reset();
    onClose();
  };

  if (!isCreating) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={onOpen}
        className="w-full rounded-xl border-dashed px-4 py-3 text-text-secondary"
      >
        <AddMemoryLabel />
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border-light px-4 py-3">
      <MemoryCreateFields
        memoryKey={key}
        onKeyChange={setKey}
        onKeyBlur={() => touchField('key')}
        keyError={keyError}
        value={value}
        onValueChange={setValue}
        onValueBlur={() => touchField('value')}
        valueError={valueError}
        onKeyDown={handleKeyPress}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleCancel}>
          {localize('com_ui_cancel')}
        </Button>
        <Button
          type="button"
          variant="submit"
          onClick={handleSave}
          disabled={isLoading || hasErrors}
          className="text-white"
          aria-label={localize('com_ui_create_memory')}
        >
          {isLoading ? <Spinner className="size-4" /> : localize('com_ui_create')}
        </Button>
      </div>
    </div>
  );
}
