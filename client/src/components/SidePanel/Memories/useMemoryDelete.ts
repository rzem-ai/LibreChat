// Deloitte Custom Change: delete-memory mutation/toast extracted from MemoryCardActions
// so both the modal (dialog) and inline (Settings tab) delete flows share it.
import { useToastContext } from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import { useDeleteMemoryMutation } from '~/data-provider';
import { getMemoryAddress } from './address';
import { useLocalize } from '~/hooks';

export default function useMemoryDelete(memory: TUserMemory, onDeleted?: () => void) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mutate: deleteMemory, isLoading: isDeleting } = useDeleteMemoryMutation();

  const confirmDelete = () => {
    const memoryAddress = getMemoryAddress(memory);
    if (!memoryAddress) {
      return;
    }
    deleteMemory(
      { ...memoryAddress, agentId: memory.agentId },
      {
        onSuccess: () => {
          showToast({ message: localize('com_ui_deleted'), status: 'success' });
          onDeleted?.();
        },
        onError: () => {
          showToast({ message: localize('com_ui_error'), status: 'error' });
        },
      },
    );
  };

  return { confirmDelete, isDeleting };
}
