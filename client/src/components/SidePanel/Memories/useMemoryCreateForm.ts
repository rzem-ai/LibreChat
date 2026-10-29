// Deloitte Custom Change: create-memory form state/mutation extracted from
// MemoryCreateDialog so both the dialog and the Settings tab's inline row share it.
import { useState } from 'react';
import { useToastContext } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { getMemoryKeyError, getMemoryValueError, getMemoryApiErrorMessage } from '~/utils/memory';
import { useCreateMemoryMutation, useMemoriesQuery } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';

interface UseMemoryCreateFormOptions {
  onSuccess?: () => void;
}

const UNTOUCHED = { key: false, value: false };

export default function useMemoryCreateForm({ onSuccess }: UseMemoryCreateFormOptions = {}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(UNTOUCHED);

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.CREATE,
  });

  const { data: memData } = useMemoriesQuery();

  const reset = () => {
    setKey('');
    setValue('');
    setTouched(UNTOUCHED);
  };

  const { mutate: createMemory, isLoading } = useCreateMemoryMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_memory_created'),
        status: 'success',
      });
      reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      showToast({
        message: getMemoryApiErrorMessage(error, localize('com_ui_error')),
        status: 'error',
      });
    },
  });

  const keyError = getMemoryKeyError({ key, memories: memData?.memories });
  const valueError = getMemoryValueError(value);
  const hasErrors = keyError != null || valueError != null;
  /** Stay quiet on a pristine empty field; validate live once there is something to judge. */
  const showKeyError = touched.key || key !== '';
  const showValueError = touched.value || value !== '';

  const handleSave = () => {
    if (!hasCreateAccess) {
      return;
    }

    if (hasErrors) {
      setTouched({ key: true, value: true });
      return;
    }

    createMemory({
      key: key.trim(),
      value: value.trim(),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && hasCreateAccess) {
      handleSave();
    }
  };

  const touchField = (field: keyof typeof UNTOUCHED) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  return {
    key,
    setKey,
    value,
    setValue,
    reset,
    touchField,
    keyError: showKeyError ? keyError : null,
    valueError: showValueError ? valueError : null,
    handleSave,
    handleKeyPress,
    isLoading,
    hasErrors,
  };
}
