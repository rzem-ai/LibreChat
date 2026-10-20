import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import { SendIcon, TooltipAnchor } from '@librechat/client';
import type { Control } from 'react-hook-form';
import { useLocalize } from '~/hooks';
// Deloitte Custom Change: restore cn for the GEL bg-primary CTA styling kept below; composerSubmitClasses is upstream's generic style and isn't used here
import { cn, isSubmittableMessage } from '~/utils';

type SendButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
  /** Number of attached files; attachments allow sending without text */
  fileCount?: number;
};

const SubmitButton = React.memo(
  forwardRef((props: { disabled: boolean }, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    return (
      <TooltipAnchor
        description={localize('com_nav_send_message')}
        render={
          <button
            ref={ref}
            aria-label={localize('com_nav_send_message')}
            id="send-button"
            data-testid="send-button"
            disabled={props.disabled}
            // Deloitte Custom Change: keep GEL brand CTA styling (bg-primary) instead of upstream's composerSubmitClasses(), pairing with SendIcon's text-primary-foreground
            className={cn(
              'rounded-full bg-primary p-1.5 text-primary-foreground outline-offset-4 transition-all duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary',
            )}
            type="submit"
          >
            <span className="" data-state="closed">
              <SendIcon size={24} />
            </span>
          </button>
        }
      />
    );
  }),
);

const SendButton = React.memo(
  forwardRef((props: SendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const data = useWatch({ control: props.control });
    const canSubmit = isSubmittableMessage(data?.text, props.fileCount);
    return <SubmitButton ref={ref} disabled={props.disabled || !canSubmit} />;
  }),
);

export default SendButton;
