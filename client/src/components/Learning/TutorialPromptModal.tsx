import { GraduationCap } from 'lucide-react';
import { OGDialog, OGDialogClose, OGDialogTemplate, Button } from '@librechat/client';
import useTutorialPrompt from '~/hooks/Learning/useTutorialPrompt';
import { useActivePanel } from '~/Providers';
import { useLocalize } from '~/hooks';

/** Mounted once in `Root`; owns the "would you like a tutorial?" first-run gate. */
export default function TutorialPromptModal() {
  const localize = useLocalize();
  const { setActive } = useActivePanel();
  const { shouldShowPrompt, markPromptSeen } = useTutorialPrompt();

  const handleAccept = () => {
    // The dialog closes itself right after this runs (OGDialogTemplate wraps
    // `selection` in an OGDialogClose), which fires onOpenChange(false) below
    // — that's what marks the prompt seen, so this only needs to switch panels.
    setActive('learning');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      markPromptSeen();
    }
  };

  return (
    <OGDialog open={shouldShowPrompt} onOpenChange={handleOpenChange}>
      <OGDialogTemplate
        title={localize('com_learning_prompt_title')}
        className="max-w-[450px]"
        showCancelButton={false}
        main={
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-submit/10">
              <GraduationCap className="h-4 w-4 text-surface-submit" />
            </div>
            <p className="text-sm text-text-secondary">{localize('com_learning_prompt_body')}</p>
          </div>
        }
        leftButtons={
          <OGDialogClose asChild>
            <Button type="button" variant="outline">
              {localize('com_learning_prompt_decline')}
            </Button>
          </OGDialogClose>
        }
        selection={{
          selectHandler: handleAccept,
          selectText: localize('com_learning_prompt_accept'),
        }}
      />
    </OGDialog>
  );
}
