// Deloitte Custom Change: form state and fields extracted to useMemoryCreateForm/
// MemoryCreateFields so the Settings tab's inline create row can share this logic
// instead of duplicating it.
import React, { useState } from 'react';
import { OGDialog, OGDialogTemplate, Button, Spinner } from '@librechat/client';
import useMemoryCreateForm from './useMemoryCreateForm';
import MemoryCreateFields from './MemoryCreateFields';
import { useLocalize } from '~/hooks';

interface MemoryCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
}

export default function MemoryCreateDialog({
  // Deloitte Custom Change: Memory HITL approval UX integration.

  open,
  onOpenChange,
  children,
  triggerRef,
}: MemoryCreateDialogProps) {
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
  } = useMemoryCreateForm({
    onSuccess: () => {
      onOpenChange(false);
      setTimeout(() => {
        triggerRef?.current?.focus();
      }, 0);
    },
  });
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      reset();
    }
  }

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      {children}
      <OGDialogTemplate
        title={localize('com_ui_create_memory')}
        showCloseButton={false}
        className="w-11/12 md:max-w-lg"
        main={
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
        }
        buttons={
          <Button
            type="button"
            variant="submit"
            onClick={handleSave}
            disabled={isLoading || hasErrors}
            aria-label={localize('com_ui_create_memory')}
          >
            {isLoading ? <Spinner className="size-4" /> : localize('com_ui_create')}
          </Button>
        }
      />
    </OGDialog>
  );
}
