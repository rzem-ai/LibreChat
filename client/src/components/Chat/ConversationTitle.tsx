import { useState } from 'react';
import { useMediaQuery } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import { ConvoOptions } from '~/components/Conversations/ConvoOptions';
import RenameForm from '~/components/Conversations/RenameForm';
import { useConversationRename, useLocalize } from '~/hooks';

const retainView = () => {};

export default function ConversationTitle({
  conversation,
}: {
  conversation: TConversation | null;
}) {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const conversationId = conversation?.conversationId ?? null;
  const title = (conversation?.title as string) ?? '';

  const {
    titleInput,
    setTitleInput,
    renaming,
    handleRename,
    handleRenameSubmit,
    handleCancelRename,
  } = useConversationRename(conversationId, title);

  if (!conversation) {
    return (
      <span className="flex-shrink-0 whitespace-nowrap px-2 text-sm font-semibold text-text-primary">
        {localize('com_ui_new_chat')}
      </span>
    );
  }

  if (renaming) {
    return (
      <div className="relative h-9 min-w-[160px]">
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={handleRenameSubmit}
          onCancel={handleCancelRename}
          localize={localize}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-0.5">
      <span
        className="max-w-[200px] flex-shrink-0 truncate px-2 text-sm font-semibold text-text-primary"
        title={title || localize('com_ui_untitled')}
        onDoubleClick={() => {
          if (isSmallScreen) {
            return;
          }
          handleRename();
        }}
      >
        {title || localize('com_ui_untitled')}
      </span>
      <ConvoOptions
        conversationId={conversationId}
        title={title}
        chatProjectId={conversation.chatProjectId}
        isPinned={conversation.pinned}
        retainView={retainView}
        renameHandler={handleRename}
        isPopoverActive={isPopoverActive}
        setIsPopoverActive={setIsPopoverActive}
        isActiveConvo={true}
      />
    </div>
  );
}
