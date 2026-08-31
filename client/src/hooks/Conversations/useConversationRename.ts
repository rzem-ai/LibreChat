import { useState, useRef, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useUpdateConversationMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

export default function useConversationRename(conversationId: string | null, title: string | null) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateConvoMutation = useUpdateConversationMutation(conversationId ?? '');

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenaming] = useState(false);
  const previousTitle = useRef(title);
  const previousConversationId = useRef(conversationId);

  useEffect(() => {
    /** A single hook instance can be reused across conversations (e.g. the
     * header's persistent title, unlike a sidebar row scoped to one
     * conversation) — cancel any in-progress rename so it doesn't silently
     * retarget to the new conversation. */
    if (conversationId !== previousConversationId.current) {
      previousConversationId.current = conversationId;
      previousTitle.current = title;
      setTitleInput(title || '');
      setRenaming(false);
      return;
    }
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [conversationId, title]);

  const handleRename = () => {
    setTitleInput(title as string);
    setRenaming(true);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!conversationId || newTitle === title) {
      setRenaming(false);
      return;
    }

    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
      setRenaming(false);
    } catch (error) {
      logger.error('Error renaming conversation', error);
      setTitleInput(title as string);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(title as string);
    setRenaming(false);
  };

  return {
    titleInput,
    setTitleInput,
    renaming,
    handleRename,
    handleRenameSubmit,
    handleCancelRename,
  };
}
