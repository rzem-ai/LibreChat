import { useMemo } from 'react';
import {
  Button,
  GelDialog,
  GelDialogHeader,
  GelDialogFooter,
  GelDialogContent,
  useToastContext,
} from '@librechat/client';
import type { TTermsOfService } from 'librechat-data-provider';
import type { GelDialogHeaderProps } from '@librechat/client';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { useAcceptTermsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

// Deloitte Custom Change: restyled onto the GEL dialog + Button primitives (was the
// legacy pre-GEL DialogTemplate) to bring this popup in line with GEL branding.
const TermsAndConditionsModal = ({
  open,
  onOpenChange,
  onAccept,
  onDecline,
  title,
  eyebrow,
  modalContent,
}: Pick<GelDialogHeaderProps, 'title' | 'eyebrow'> & {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAccept?: () => void;
  onDecline?: () => void;
  contentUrl?: string;
  modalContent?: TTermsOfService['modalContent'];
}) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  // Deloitte Custom Change: omitting onAccept/onDecline means the modal is being reopened
  // read-only from the avatar menu (terms already accepted) — no separate prop needed.
  const readOnly = onAccept == null && onDecline == null;
  const acceptTermsMutation = useAcceptTermsMutation({
    onSuccess: () => {
      onAccept?.();
      onOpenChange(false);
    },
    onError: () => {
      showToast({ message: 'Failed to accept terms' });
    },
  });

  const handleAccept = () => {
    acceptTermsMutation.mutate();
  };

  const handleDecline = () => {
    onDecline?.();
    onOpenChange(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!readOnly && open && !isOpen) {
      return;
    }
    onOpenChange(isOpen);
  };

  const content = useMemo(() => {
    if (typeof modalContent === 'string') {
      return modalContent;
    }

    if (Array.isArray(modalContent)) {
      return modalContent.join('\n');
    }

    return '';
  }, [modalContent]);

  return (
    <GelDialog open={open} onOpenChange={handleOpenChange}>
      <GelDialogContent className="w-11/12 max-w-2xl">
        <GelDialogHeader
          eyebrow={eyebrow}
          title={title ?? localize('com_ui_terms_and_conditions')}
          onClose={readOnly ? handleClose : undefined}
        />
        <section
          // Motivation: This is a dialog, so its content should be focusable
          tabIndex={0}
          className="max-h-[60vh] overflow-y-auto px-6 py-4"
          aria-label={localize('com_ui_terms_and_conditions')}
        >
          <div className="prose dark:prose-invert w-full max-w-none !text-text-primary">
            {content !== '' ? (
              <MarkdownLite content={content} />
            ) : (
              <p>{localize('com_ui_no_terms_content')}</p>
            )}
          </div>
        </section>
        <GelDialogFooter>
          {readOnly ? (
            <Button onClick={handleClose}>{localize('com_ui_close')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleDecline}>
                {localize('com_ui_decline')}
              </Button>
              <Button onClick={handleAccept}>{localize('com_ui_accept')}</Button>
            </>
          )}
        </GelDialogFooter>
      </GelDialogContent>
    </GelDialog>
  );
};

export default TermsAndConditionsModal;
