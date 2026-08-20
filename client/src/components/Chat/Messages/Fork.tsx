import React from 'react';
import { GitFork } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { ForkOptions } from 'librechat-data-provider';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { useForkConvoMutation } from '~/data-provider';
import { cn } from '~/utils';

export default function Fork({
  messageId,
  conversationId: _convoId,
  forkingSupported = false,
  latestMessageId,
  isLast = false,
}: {
  messageId: string;
  conversationId: string | null;
  forkingSupported?: boolean;
  latestMessageId?: string;
  isLast?: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();

  const buttonStyle = cn(
    'hover-button rounded-lg p-1.5 text-text-secondary-alt',
    'hover:text-text-primary hover:bg-surface-hover',
    'group-hover:visible group-focus-within:visible group-[.final-completion]:visible',
    !isLast &&
      'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
  );

  const forkConvo = useForkConvoMutation({
    onSuccess: (data) => {
      navigateToConvo(data.conversation);
      showToast({
        message: localize('com_ui_fork_success'),
        status: 'success',
      });
    },
    onMutate: () => {
      showToast({
        message: localize('com_ui_fork_processing'),
        status: 'info',
      });
    },
    onError: (error) => {
      /** Rate limit error (429 status code) */
      const isRateLimitError =
        (error as any)?.response?.status === 429 ||
        (error as any)?.status === 429 ||
        (error as any)?.statusCode === 429;

      showToast({
        message: isRateLimitError
          ? localize('com_ui_fork_error_rate_limit')
          : localize('com_ui_fork_error'),
        status: 'error',
      });
    },
  });

  const conversationId = _convoId ?? '';
  if (!forkingSupported || !conversationId || !messageId) {
    return null;
  }

  const onClick = () => {
    forkConvo.mutate({
      messageId,
      conversationId,
      option: ForkOptions.TARGET_LEVEL,
      splitAtTarget: false,
      latestMessageId,
    });
  };

  return (
    <button
      className={buttonStyle}
      onClick={onClick}
      type="button"
      aria-label={localize('com_ui_fork_all_target')}
    >
      <GitFork size="19" aria-hidden="true" />
    </button>
  );
}
